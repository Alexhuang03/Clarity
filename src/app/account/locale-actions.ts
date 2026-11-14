"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Le site est-il servi en HTTPS ? (en-tête du proxy, sinon l'adresse publique configurée) */
async function isHttps() {
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
}

async function writeCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: ONE_YEAR,
    sameSite: "lax",
    path: "/",
    httpOnly: false,
    secure: await isHttps(),
  });
}

/**
 * Langue de l'interface et des réponses de l'IA : cookie clarity_locale (1 an), et réglage du compte
 * (user_settings.locale) si l'utilisateur est connecté. Valeur invalide : refusée.
 */
export async function setLocale(locale: unknown): Promise<{ error?: string }> {
  if (!isLocale(locale)) return { error: "Langue inconnue." };
  await writeCookie(locale);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) {
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, locale, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    // Le cookie suffit pour l'affichage : l'échec de l'enregistrement est seulement signalé
    if (error) console.error("[langue] réglage non enregistré", error.message);
    // Visiteur non connecté : le navigateur rafraîchit déjà la page (router.refresh), inutile d'invalider le cache
    revalidatePath("/", "layout");
  }
  return {};
}

/**
 * À appeler juste après la connexion : aligne la langue sur le compte.
 * - Le compte a une langue choisie (user_settings.locale non nul) : elle s'applique (cookie mis à jour).
 * - Aucune langue choisie (null, ou pas encore de réglages) : la langue choisie avant la connexion (cookie)
 *   est enregistrée ; sans cookie non plus, rien n'est enregistré (le français reste un défaut, pas un choix).
 * Renvoie la langue retenue.
 */
export async function syncLocaleAfterLogin(): Promise<{ locale: Locale }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
  const current = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
  if (!userId) return { locale: current };

  const { data: settings, error } = await supabase.from("user_settings").select("*").maybeSingle();
  if (error) return { locale: current };
  const saved = settings?.locale;
  if (settings && isLocale(saved)) {
    if (saved !== current) {
      await writeCookie(saved);
      revalidatePath("/", "layout");
    }
    return { locale: saved };
  }
  if (isLocale(cookieValue)) {
    await supabase
      .from("user_settings")
      .upsert({ user_id: userId, locale: cookieValue, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }
  return { locale: current };
}

import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, INTL_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { dictionaries } from "./dictionaries";

/**
 * Langue de la requête : cookie clarity_locale, sinon le français. Lire un cookie rend le composant
 * dynamique : à appeler sous <Suspense> (la mise en page racine en fournit un autour de toute l'app).
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Dictionnaire de la langue de la requête, pour les composants serveur. */
export async function getT() {
  const locale = await getLocale();
  return { t: dictionaries[locale], locale, intl: INTL_LOCALE[locale] };
}

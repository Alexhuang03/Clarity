import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Aides pour les routes d'API et les Server Actions : authentification, propriété et validation des entrées.

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
export type AuthedUser = { id: string; email: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant au format UUID (les ids de toutes les tables). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Réponse d'erreur JSON (message en français, jamais de détail interne). */
export function jsonError(message: string, status = 400, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Route d'API : utilisateur connecté et client Supabase de la requête (soumis à la RLS),
 * ou une réponse 401 à renvoyer telle quelle.
 *
 *   const auth = await requireUser();
 *   if (auth instanceof Response) return auth;
 *   const { user, supabase } = auth;
 */
export async function requireUser(): Promise<{ user: AuthedUser; supabase: ServerSupabase } | Response> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return jsonError("Non connecté.", 401);
  return { user: { id: sub, email: String(data.claims.email ?? "") }, supabase };
}

/**
 * Le cours appartient-il à l'utilisateur connecté ? (RLS : un cours d'un autre n'est jamais renvoyé.)
 * À appeler avant toute lecture ou écriture liée à un cours dont l'id vient du navigateur.
 */
export async function requireOwnedCourse(supabase: SupabaseClient, courseId: unknown) {
  if (!isUuid(courseId)) return null;
  const { data } = await supabase.from("courses").select("id, title, user_id").eq("id", courseId).maybeSingle();
  return data as { id: string; title: string; user_id: string } | null;
}

/**
 * Corps JSON d'une requête, limité en taille. Renvoie une réponse 400 / 413 en cas de problème.
 * Toujours vérifier ensuite le type de chaque champ (le navigateur peut envoyer n'importe quoi).
 */
export async function readJsonBody<T extends Record<string, unknown> = Record<string, unknown>>(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Partial<T> | Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return jsonError("Requête trop volumineuse.", 413);
  let text: string;
  try {
    text = await request.text();
  } catch {
    return jsonError("Requête invalide.");
  }
  if (text.length > maxBytes) return jsonError("Requête trop volumineuse.", 413);
  if (!text.trim()) return {} as Partial<T>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError("Requête invalide.");
    return parsed as Partial<T>;
  } catch {
    return jsonError("Requête invalide.");
  }
}

/** Texte saisi par l'utilisateur : chaîne, sans caractères de contrôle invisibles, coupée à `max` caractères. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .trim()
    .slice(0, max);
}

/** Valeur parmi une liste autorisée, sinon la valeur par défaut. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Refuse les requêtes envoyées depuis un autre site (CSRF) : réponse 403, ou null si la requête est acceptée.
 * - `Sec-Fetch-Site` (navigateurs récents) : seulement « same-origin » ou « none » (saisie directe) ;
 * - `Origin`, s'il est présent : même hôte que la requête, ou l'adresse publique du site (NEXT_PUBLIC_SITE_URL).
 */
export function requireSameOrigin(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return jsonError("Requête refusée.", 403);
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return jsonError("Requête refusée.", 403);
    }
    const allowed = new Set<string>();
    const host = request.headers.get("host");
    if (host) allowed.add(host);
    try {
      allowed.add(new URL(request.url).host);
    } catch {
      // URL de requête relative : l'en-tête Host suffit
    }
    try {
      if (process.env.NEXT_PUBLIC_SITE_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
    } catch {
      // Adresse publique mal renseignée : ignorée
    }
    if (!allowed.has(originHost)) return jsonError("Requête refusée.", 403);
  }
  return null;
}

/** Le corps doit être déclaré en JSON (une requête « simple » d'un autre site ne peut pas l'être sans préflight CORS). */
export function requireJsonContentType(request: Request): Response | null {
  const type = request.headers.get("content-type") ?? "";
  return /^application\/json\s*(;|$)/i.test(type) ? null : jsonError("Requête invalide.", 415);
}

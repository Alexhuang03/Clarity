import "server-only";
import { safeError } from "@/lib/security/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCourseContext } from "@/lib/course/context";
import { enforceRateLimit, enforceRateLimits, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CourseContext } from "./content";
import { StudyError } from "./llm";
import { parse, v, type Schema } from "./validate";
import type { StudyScope } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Corps de requête : au-delà, refusé avant même d'être lu en JSON */
const BODY_MAX_BYTES = 100_000;

export type Session = { supabase: SupabaseClient; userId: string; courseId: string };

/** Exécute une route et transforme les erreurs en réponses JSON { error }. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StudyError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store", ...error.headers } });
    }
    console.error("[révision] erreur inattendue", safeError(error));
    return Response.json({ error: "Erreur interne. Réessaie." }, { status: 500 });
  }
}

export function assertUuid(id: string | undefined, what = "Élément"): string {
  if (!id || !UUID.test(id)) throw new StudyError(`${what} introuvable`, 404);
  return id.toLowerCase();
}

/** Utilisateur connecté + cours qui lui appartient (RLS). */
export async function requireCourse(params: Promise<{ id: string }>): Promise<Session> {
  const { id } = await params;
  const courseId = assertUuid(id, "Cours");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) throw new StudyError("Non connecté", 401);
  const { data: course } = await supabase.from("courses").select("id").eq("id", courseId).maybeSingle();
  if (!course) throw new StudyError("Cours introuvable", 404);
  return { supabase, userId: auth.claims.sub, courseId };
}

/** Comme requireCourse, avec le contexte nécessaire aux générations (documents prêts, réglages). */
export async function requireCourseContext(params: Promise<{ id: string }>): Promise<Session & { ctx: CourseContext }> {
  const { id } = await params;
  const courseId = assertUuid(id, "Cours");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) throw new StudyError("Non connecté", 401);
  const ctx = await loadCourseContext(supabase, courseId);
  if (!ctx) throw new StudyError("Cours introuvable", 404);
  return { supabase, userId: auth.claims.sub, courseId, ctx };
}

/** Lit et valide un corps JSON (taille limitée). Corps vide = {}. */
export async function readBody<T>(request: Request, schema: Schema<T>): Promise<T> {
  const raw = await request.text();
  if (raw.length > BODY_MAX_BYTES) throw new StudyError("Requête trop volumineuse", 413);
  let json: unknown = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new StudyError("JSON invalide");
    }
  }
  const r = parse(schema, json);
  if (!r.ok) throw new StudyError(`Requête invalide — ${r.error}`);
  return r.value;
}

export const scopeSchema: Schema<StudyScope> = v.optional(
  v.object({
    partIds: v.optional(v.array(v.uuid(), { max: 100 })),
    documentIds: v.optional(v.array(v.uuid(), { max: 100 })),
  }),
  {},
);

/** Erreur Supabase → erreur générique (le détail reste dans les journaux). */
export function dbError(error: unknown, message = "Erreur de base de données. Réessaie."): never {
  console.error("[révision] base de données", safeError(error));
  throw new StudyError(message, 500);
}

/**
 * Client serveur (clé secrète, contourne la RLS) pour les données que l'utilisateur ne doit ni lire ni
 * modifier lui-même : corrigés des quiz, tentatives et notes. À n'utiliser qu'APRÈS avoir vérifié la propriété
 * avec le client de la requête, et toujours avec des filtres explicites (id, user_id).
 */
export function trustedClient(): SupabaseClient {
  return createAdminClient();
}

/** Limite de débit d'une action sans IA (ex. démarrer une tentative). */
export async function enforceLimit(userId: string, bucket: string, opts: { limit: number; windowSec: number }) {
  const result = await enforceRateLimit(userId, bucket, opts);
  if (!result.ok) throw new StudyError(result.message, 429, { "Retry-After": String(result.retryAfterSec) });
}

/** Limite de débit des outils d'étude : à appeler juste avant chaque appel à une IA. */
export async function enforceStudyLimit(userId: string) {
  const result = await enforceRateLimits(userId, RATE_LIMITS.study);
  if (!result.ok) throw new StudyError(result.message, 429, { "Retry-After": String(result.retryAfterSec) });
}

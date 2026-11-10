import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Limitation de débit par utilisateur : protège les quotas (et la facture) des IA contre les abus.
// Compteurs en base (table rate_limits + fonction rate_limit_hit, migration 20261110000100) : partagés
// entre toutes les instances du serveur. Si la base est injoignable ou la migration absente,
// repli sur un compteur en mémoire (par instance), pour ne jamais bloquer le site.

export type RateRule = {
  /** Nom du compteur : minuscules, chiffres et « : _ . - » (64 caractères max) */
  bucket: string;
  /** Appels autorisés par fenêtre */
  limit: number;
  /** Durée de la fenêtre, en secondes */
  windowSec: number;
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number; message: string };

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** Plafond global d'appels aux IA par utilisateur et par jour, compté en plus des limites par fonctionnalité. */
const LLM_DAILY: RateRule = { bucket: "llm:all:day", limit: 600, windowSec: DAY };

/**
 * Limites prêtes à l'emploi. Les nouvelles fonctionnalités qui appellent une IA doivent en utiliser une
 * (ou en ajouter une ici), avec `enforceRateLimits(userId, RATE_LIMITS.xxx)`.
 */
export const RATE_LIMITS = {
  /** Question dans le chat d'un cours */
  chat: [{ bucket: "llm:chat:min", limit: 12, windowSec: MINUTE }, { bucket: "llm:chat:day", limit: 300, windowSec: DAY }, LLM_DAILY],
  /** Résumé d'une partie (gros appel) */
  summary: [{ bucket: "llm:summary:min", limit: 4, windowSec: MINUTE }, { bucket: "llm:summary:day", limit: 60, windowSec: DAY }, LLM_DAILY],
  /** Réponse dans une bulle d'annotation */
  annotationReply: [{ bucket: "llm:reply:min", limit: 12, windowSec: MINUTE }, { bucket: "llm:reply:day", limit: 300, windowSec: DAY }, LLM_DAILY],
  /** Analyse / mise à jour des parties d'un cours */
  analyze: [{ bucket: "llm:analyze:10min", limit: 10, windowSec: 10 * MINUTE }, { bucket: "llm:analyze:day", limit: 80, windowSec: DAY }, LLM_DAILY],
  /** Import d'un document (fichier, lien, nouvel essai) : lecture par l'IA + embeddings */
  ingest: [{ bucket: "ingest:10min", limit: 20, windowSec: 10 * MINUTE }, { bucket: "ingest:day", limit: 100, windowSec: DAY }, LLM_DAILY],
  /** Outils d'étude (quiz, fiches, flashcards, examens blancs, cartes mentales...) */
  study: [{ bucket: "llm:study:min", limit: 6, windowSec: MINUTE }, { bucket: "llm:study:hour", limit: 60, windowSec: HOUR }, { bucket: "llm:study:day", limit: 200, windowSec: DAY }, LLM_DAILY],
} satisfies Record<string, RateRule[]>;

const BUCKET = /^[a-z0-9:_.-]{1,64}$/;

// ---------- Repli en mémoire (une seule instance) ----------
type Counter = { start: number; hits: number };
const globalForLimits = globalThis as typeof globalThis & { __clarityRateLimits?: Map<string, Counter> };
const memory = (globalForLimits.__clarityRateLimits ??= new Map());
let warned = false;

function hitMemory(userId: string, rule: RateRule) {
  const key = `${userId}|${rule.bucket}`;
  const now = Date.now();
  let counter = memory.get(key);
  if (!counter || now - counter.start >= rule.windowSec * 1000) {
    counter = { start: now, hits: 0 };
    memory.set(key, counter);
  }
  counter.hits++;
  // Ménage léger pour ne pas grossir indéfiniment
  if (memory.size > 50_000) {
    for (const [k, c] of memory) if (now - c.start > DAY * 1000) memory.delete(k);
  }
  return {
    allowed: counter.hits <= rule.limit,
    retryAfter: Math.max(1, Math.ceil((counter.start + rule.windowSec * 1000 - now) / 1000)),
  };
}

async function hit(userId: string, rule: RateRule) {
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_user_id: userId,
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSec,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after: number } | null;
    if (!row) throw new Error("réponse vide");
    return { allowed: row.allowed, retryAfter: row.retry_after };
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn("[sécurité] limitation de débit en base indisponible, repli en mémoire :", (error as Error).message);
    }
    return hitMemory(userId, rule);
  }
}

function waitMessage(seconds: number) {
  if (seconds < 90) return `Trop de demandes. Réessaie dans ${seconds} s.`;
  if (seconds < 2 * HOUR) return `Trop de demandes. Réessaie dans ${Math.ceil(seconds / 60)} min.`;
  return "Limite quotidienne atteinte. Réessaie demain.";
}

/** Compte un appel pour une règle. */
export async function enforceRateLimit(userId: string, bucket: string, opts: { limit: number; windowSec: number }) {
  return enforceRateLimits(userId, [{ bucket, ...opts }]);
}

/** Compte un appel pour plusieurs règles (ex. par minute + par jour). Refusé si l'une d'elles est dépassée. */
export async function enforceRateLimits(userId: string, rules: RateRule[]): Promise<RateLimitResult> {
  if (!userId) return { ok: false, retryAfterSec: 60, message: "Non connecté." };
  for (const rule of rules) {
    if (!BUCKET.test(rule.bucket)) throw new Error(`Nom de compteur invalide : ${rule.bucket}`);
  }
  const results = await Promise.all(rules.map((rule) => hit(userId, rule)));
  const refused = results.filter((r) => !r.allowed);
  if (refused.length === 0) return { ok: true };
  const retryAfterSec = Math.max(...refused.map((r) => r.retryAfter));
  return { ok: false, retryAfterSec, message: waitMessage(retryAfterSec) };
}

/** Réponse HTTP 429 pour une route d'API. */
export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return Response.json(
    { error: result.message },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec), "Cache-Control": "no-store" } },
  );
}

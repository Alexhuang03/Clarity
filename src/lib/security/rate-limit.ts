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
  /** Mode professeur : génération d'un cours complet à partir d'un sujet (recherche web + 1 appel par chapitre) */
  teach: [{ bucket: "llm:teach:hour", limit: 3, windowSec: HOUR }, { bucket: "llm:teach:day", limit: 3, windowSec: DAY }, LLM_DAILY],
  /** Appels à l'IA supplémentaires prévus par une génération du mode professeur : un seul appel, avec un coût */
  teachCall: [{ bucket: "llm:teach-calls:day", limit: 30, windowSec: DAY }, LLM_DAILY],
} satisfies Record<string, RateRule[]>;

/**
 * Plafonds communs à TOUS les utilisateurs (protègent le quota partagé des clés d'IA).
 * À utiliser avec `enforceGlobalRateLimits`.
 */
export const GLOBAL_RATE_LIMITS = {
  /** Mode professeur : générations par jour, tous utilisateurs confondus */
  teach: [{ bucket: "teach:global:day", limit: 5, windowSec: DAY }],
} satisfies Record<string, RateRule[]>;

/** Identifiant sentinelle des compteurs globaux (table rate_limits_global, migration 20261114000002) */
const GLOBAL_ID = "00000000-0000-0000-0000-000000000000";

const BUCKET = /^[a-z0-9:_.-]{1,64}$/;

// ---------- Repli en mémoire (une seule instance) ----------
type Counter = { start: number; hits: number };
const globalForLimits = globalThis as typeof globalThis & { __clarityRateLimits?: Map<string, Counter> };
const memory = (globalForLimits.__clarityRateLimits ??= new Map());
let warned = false;

function hitMemory(userId: string, rule: RateRule, cost: number) {
  const key = `${userId}|${rule.bucket}`;
  const now = Date.now();
  let counter = memory.get(key);
  if (!counter || now - counter.start >= rule.windowSec * 1000) {
    counter = { start: now, hits: 0 };
    memory.set(key, counter);
  }
  counter.hits += cost;
  // Ménage léger pour ne pas grossir indéfiniment
  if (memory.size > 50_000) {
    for (const [k, c] of memory) if (now - c.start > DAY * 1000) memory.delete(k);
  }
  return {
    allowed: counter.hits <= rule.limit,
    retryAfter: Math.max(1, Math.ceil((counter.start + rule.windowSec * 1000 - now) / 1000)),
  };
}

async function hit(userId: string, rule: RateRule, cost: number) {
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_user_id: userId,
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSec,
      // Envoyé seulement s'il diffère de 1 : reste compatible avec une base sans la migration du coût
      ...(cost !== 1 ? { p_cost: cost } : {}),
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
    return hitMemory(userId, rule, cost);
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

/**
 * Compte un appel pour plusieurs règles (ex. par minute + par jour). Refusé si l'une d'elles est dépassée.
 * `cost` : nombre d'unités comptées par cet appel (1 par défaut).
 */
export async function enforceRateLimits(userId: string, rules: RateRule[], { cost = 1 } = {}): Promise<RateLimitResult> {
  if (!userId) return { ok: false, retryAfterSec: 60, message: "Non connecté." };
  if (!Number.isInteger(cost) || cost < 1 || cost > 1000) throw new Error(`Coût invalide : ${cost}`);
  for (const rule of rules) {
    if (!BUCKET.test(rule.bucket)) throw new Error(`Nom de compteur invalide : ${rule.bucket}`);
  }
  const results = await Promise.all(rules.map((rule) => hit(userId, rule, cost)));
  const refused = results.filter((r) => !r.allowed);
  if (refused.length === 0) return { ok: true };
  const retryAfterSec = Math.max(...refused.map((r) => r.retryAfter));
  return { ok: false, retryAfterSec, message: waitMessage(retryAfterSec) };
}

/** Compte un appel sur des plafonds globaux (tous utilisateurs). Message générique en cas de refus. */
export async function enforceGlobalRateLimits(rules: RateRule[], opts: { cost?: number } = {}): Promise<RateLimitResult> {
  const result = await enforceRateLimits(GLOBAL_ID, rules, opts);
  return result.ok ? result : { ...result, message: "Le service est très demandé aujourd'hui. Réessaie demain." };
}

/** Réponse HTTP 429 pour une route d'API. */
export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return Response.json(
    { error: result.message },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec), "Cache-Control": "no-store" } },
  );
}

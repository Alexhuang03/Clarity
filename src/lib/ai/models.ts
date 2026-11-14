import "server-only";

// Un modèle est désigné par "fournisseur:identifiant".
export type ModelId = `${"gemini" | "groq" | "openrouter"}:${string}`;

// Modèle d'embeddings figé : changer de modèle rend les vecteurs déjà stockés incompatibles.
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

// Versions précises plutôt que les alias « -latest » : ceux-ci pointent toujours vers le modèle le plus
// récent, saturé en gratuit. Mesuré le 26/10/2026 sur la lecture d'une page de cours en photo :
// gemini-flash-latest (3.8) et 3.7-flash → 503 ou aucune réponse en 90 à 180 s ; 3.6-flash → 4-5 s ;
// 3.5-flash → 5-50 s ; 3.1-flash-lite → 3 s. L'alias reste en dernier secours : une version retirée
// renvoie 404 et la chaîne passe simplement à la suivante.
const FLASH: ModelId[] = ["gemini:gemini-3.6-flash", "gemini:gemini-3.5-flash", "gemini:gemini-flash-latest"];
const FLASH_LITE: ModelId[] = ["gemini:gemini-3.1-flash-lite", "gemini:gemini-3.5-flash-lite", "gemini:gemini-flash-lite-latest"];

// Chaînes de secours : si un modèle échoue (quota, surcharge, délai), on passe au suivant.
const CHAINS: Record<"summary" | "chat" | "light" | "analysis" | "vision" | "figures" | "study" | "teachPlan" | "teach" | "teachWrite", ModelId[]> = {
  // Outils d'étude (quiz, flashcards, fiches, cartes mentales…) : Flash-Lite d'abord (quota large),
  // pour préserver les ~20 requêtes/jour de Flash réservées aux résumés ; gpt-oss-120b en secours
  study: [FLASH_LITE[0], FLASH_LITE[1], FLASH[0], "groq:openai/gpt-oss-120b", FLASH[1]],
  // Résumés : gros contexte et bonne qualité d'explication (Groq gratuit : 8 000 tokens/min, trop peu pour une partie)
  summary: [...FLASH, FLASH_LITE[0], "groq:openai/gpt-oss-120b"],
  // Questions : rapidité d'abord
  chat: ["groq:openai/gpt-oss-120b", FLASH[0], FLASH[1], FLASH_LITE[0]],
  // Analyse de chaque question du chat : quelqu'un attend, la vitesse prime (Groq gpt-oss-20b : 0,2-0,5 s)
  analysis: ["groq:openai/gpt-oss-20b", "groq:openai/gpt-oss-120b", FLASH_LITE[0]],
  // Petites tâches sans urgence (titres des parties...)
  light: [FLASH_LITE[0], "groq:openai/gpt-oss-20b", FLASH_LITE[1], FLASH[0]],
  // Lecture des PDF et des images (multimodal : Gemini uniquement). Flash-Lite d'abord : transcrire ne demande
  // pas de raisonnement, et un PDF de 100 pages = 20 requêtes, soit tout le quota quotidien gratuit d'un modèle Flash.
  // Avant, la lecture épuisait Flash et les résumés (qui en ont besoin) retombaient sur Flash-Lite.
  vision: [FLASH_LITE[0], FLASH_LITE[1], FLASH[0], FLASH[1], FLASH[2]],
  // Description des schémas d'un cours en ligne : Flash-Lite suffit, et préserve le quota gratuit
  // de Flash (20 requêtes par jour seulement), réservé aux résumés
  figures: [...FLASH_LITE, FLASH[1]],
  // Mode professeur. Le quota gratuit de Flash (~20 requêtes/jour) est partagé avec les résumés : Flash seulement
  // pour le plan (1 appel), Flash-Lite en tête pour les chapitres (jusqu'à 8 appels). Recherche web (Grounding with
  // Google Search) : Gemini uniquement, Flash-Lite compris.
  teachPlan: [FLASH[0], FLASH[1], FLASH_LITE[0], FLASH_LITE[1]],
  teach: [FLASH_LITE[0], FLASH_LITE[1], FLASH[0], FLASH[1]],
  // Rédaction d'un chapitre sans recherche Google (secours Wikipédia ou de mémoire) : gpt-oss-120b en secours
  teachWrite: [FLASH_LITE[0], FLASH_LITE[1], "groq:openai/gpt-oss-120b", FLASH[0]],
};

/** Tous les modèles connus du code : un modèle « préféré » hors de cette liste est ignoré. */
const ALLOWED_MODELS = new Set<string>(Object.values(CHAINS).flat());

const KEYS: Record<string, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
};

// ---- Santé des modèles : un modèle saturé ou introuvable passe en fin de chaîne pendant un moment ----
// (sinon chaque page d'un PDF, chaque question, perdrait à nouveau du temps sur lui)
const globalForHealth = globalThis as typeof globalThis & { __clarityModelHealth?: Map<string, number> };
const unavailableUntil = (globalForHealth.__clarityModelHealth ??= new Map());

/** Note qu'un modèle vient d'échouer (surcharge, quota, délai, introuvable) : il est évité pendant `ms`. */
export function markUnavailable(model: string, ms = 5 * 60_000) {
  unavailableUntil.set(model, Date.now() + ms);
}
export function markAvailable(model: string) {
  unavailableUntil.delete(model);
}
const isHealthy = (model: string) => (unavailableUntil.get(model) ?? 0) <= Date.now();

/** Chaîne de modèles pour un usage : clé renseignée, modèles en bonne santé d'abord (l'ordre est gardé sinon). */
export type ModelUse = keyof typeof CHAINS;

export function modelChain(use: ModelUse, preferred?: string | null): ModelId[] {
  // Le modèle choisi par l'utilisateur passe en tête, les autres restent en secours.
  // Sécurité : le réglage vient de la base, modifiable par l'utilisateur via l'API Supabase. Seuls les modèles
  // gratuits de nos listes sont acceptés (sinon : modèle payant sur nos clés, ou identifiant injecté dans l'URL).
  if (preferred && !ALLOWED_MODELS.has(preferred)) preferred = null;
  const chain = preferred
    ? [preferred as ModelId, ...CHAINS[use].filter((m) => m !== preferred)]
    : CHAINS[use];
  const available = chain.filter((m) => KEYS[m.split(":")[0]]);
  if (available.length === 0) {
    throw new Error("Aucune clé API d'IA configurée (GEMINI_API_KEY, GROQ_API_KEY ou OPENROUTER_API_KEY).");
  }
  return [...available.filter(isHealthy), ...available.filter((m) => !isHealthy(m))];
}

export function apiKey(provider: string): string {
  const key = KEYS[provider];
  if (!key) throw new Error(`Clé API manquante pour ${provider}`);
  return key;
}

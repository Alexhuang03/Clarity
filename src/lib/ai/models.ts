import "server-only";

// Un modèle est désigné par "fournisseur:identifiant".
export type ModelId = `${"gemini" | "groq" | "openrouter"}:${string}`;

// Modèle d'embeddings figé : changer de modèle rend les vecteurs déjà stockés incompatibles.
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

// Lecture des PDF et images (multimodal)
export const VISION_MODEL = "gemini-flash-latest";

// Chaînes de secours : si un modèle échoue (quota, surcharge), on passe au suivant.
const CHAINS: Record<"summary" | "chat" | "light", ModelId[]> = {
  // Résumés : gros contexte et bonne qualité d'explication
  summary: ["gemini:gemini-flash-latest", "gemini:gemini-flash-lite-latest", "groq:openai/gpt-oss-120b"],
  // Questions : rapidité d'abord
  chat: ["groq:openai/gpt-oss-120b", "gemini:gemini-flash-latest", "gemini:gemini-flash-lite-latest"],
  // Petites tâches (titres des parties...)
  light: ["gemini:gemini-flash-lite-latest", "groq:openai/gpt-oss-20b", "gemini:gemini-flash-latest"],
};

const KEYS: Record<string, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
};

/** Chaîne de modèles pour un usage, limitée aux fournisseurs dont la clé est renseignée. */
export function modelChain(use: keyof typeof CHAINS, preferred?: string | null): ModelId[] {
  // Le modèle choisi par l'utilisateur passe en tête, les autres restent en secours
  const chain = preferred
    ? [preferred as ModelId, ...CHAINS[use].filter((m) => m !== preferred)]
    : CHAINS[use];
  const available = chain.filter((m) => KEYS[m.split(":")[0]]);
  if (available.length === 0) {
    throw new Error("Aucune clé API d'IA configurée (GEMINI_API_KEY, GROQ_API_KEY ou OPENROUTER_API_KEY).");
  }
  return available;
}

export function apiKey(provider: string): string {
  const key = KEYS[provider];
  if (!key) throw new Error(`Clé API manquante pour ${provider}`);
  return key;
}

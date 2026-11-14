import "server-only";
import { apiKey, modelChain } from "@/lib/ai/models";
import { ProviderError } from "@/lib/ai/providers";

// Gemini avec l'outil « Grounding with Google Search » (API REST generateContent).
// La réponse contient candidates[0].groundingMetadata : groundingChunks[].web {uri, title},
// groundingSupports[] {segment, groundingChunkIndices} et searchEntryPoint.renderedContent
// (suggestions de recherche que Google demande d'afficher avec le texte).

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 150_000;
// Quand le quota de recherche est épuisé (429 sur tous les modèles), on n'essaie plus pendant ce délai
const GROUNDING_COOLDOWN_MS = 15 * 60_000;

const globalForGrounding = globalThis as typeof globalThis & { __clarityGroundingDownUntil?: number };

export class GroundingUnavailable extends Error {}

export type GroundedResult = {
  text: string;
  model: string;
  chunks: { uri: string; title: string }[];
  supports: { segment?: { startIndex?: number; endIndex?: number; text?: string }; groundingChunkIndices?: number[] }[];
  searchEntryPointHtml: string | null;
};

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: unknown; title?: unknown } }[];
      groundingSupports?: GroundedResult["supports"];
      searchEntryPoint?: { renderedContent?: unknown };
    };
  }[];
};

export function groundingAvailable() {
  return (globalForGrounding.__clarityGroundingDownUntil ?? 0) <= Date.now();
}

/**
 * Génère un texte appuyé sur une recherche Google. Essaie chaque modèle Gemini de la chaîne « teach ».
 * Lève GroundingUnavailable si la recherche est indisponible (quota épuisé, erreurs) : l'appelant passe au secours.
 * Un 429 ici ne marque PAS le modèle indisponible pour le reste du site : c'est souvent le quota de la
 * recherche, pas celui du modèle.
 */
export async function groundedGenerate(req: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** « teachPlan » (Flash d'abord) ou « teach » (Flash-Lite d'abord) */
  use: "teachPlan" | "teach";
  /** Échéance globale de la génération */
  signal?: AbortSignal;
}): Promise<GroundedResult> {
  if (!groundingAvailable()) throw new GroundingUnavailable("recherche Google en pause (quota)");
  const chain = modelChain(req.use).filter((m) => m.startsWith("gemini:"));
  // Échecs « service » (quota 429, modèle introuvable 404, surcharge 5xx, délai) : s'ils sont les seuls, pause
  let serviceErrors = 0;
  let lastError: unknown;

  for (const model of chain) {
    const id = model.split(":")[1];
    try {
      const res = await fetch(`${BASE}/${id}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey("gemini"), "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: req.maxTokens + 4096,
            temperature: req.temperature ?? 0.4,
          },
        }),
        signal: req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429 || res.status === 404 || res.status >= 500) serviceErrors++;
        throw new ProviderError(`${id} → HTTP ${res.status} ${body.slice(0, 200)}`, res.status, true);
      }
      const data = (await res.json()) as GeminiResponse;
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (!text.trim()) throw new ProviderError(`${id} : réponse vide (${candidate?.finishReason ?? "?"})`, 502, true);
      const meta = candidate?.groundingMetadata;
      const html = meta?.searchEntryPoint?.renderedContent;
      return {
        text,
        model,
        chunks: (meta?.groundingChunks ?? []).map((c) => ({
          uri: typeof c.web?.uri === "string" ? c.web.uri : "",
          title: typeof c.web?.title === "string" ? c.web.title : "",
        })),
        supports: Array.isArray(meta?.groundingSupports) ? meta.groundingSupports : [],
        searchEntryPointHtml: typeof html === "string" && html.length <= 65_536 ? html : null,
      };
    } catch (error) {
      lastError = error;
      // Échéance globale dépassée : inutile d'essayer les autres modèles
      if (req.signal?.aborted) throw error;
      if (!(error instanceof ProviderError)) serviceErrors++; // délai dépassé, coupure réseau
      console.warn(`[professeur] recherche Google avec ${id} impossible :`, (error as Error).message.slice(0, 200));
    }
  }
  // Tous les modèles échouent côté service : la recherche est mise en pause un moment
  if (serviceErrors >= chain.length) {
    globalForGrounding.__clarityGroundingDownUntil = Date.now() + GROUNDING_COOLDOWN_MS;
  }
  throw new GroundingUnavailable((lastError as Error)?.message ?? "recherche Google indisponible");
}

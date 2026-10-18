import "server-only";
import { apiKey, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, VISION_MODEL } from "./models";
import { ProviderError } from "./providers";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Appel Gemini avec nouvelles tentatives sur quota (429), surcharge (5xx) et requête bloquée.
 * timeoutMs : sans limite, une requête que Gemini ne termine jamais bloquerait le document
 * pendant des dizaines de minutes (5 min d'attente par défaut dans Node, à chaque tentative).
 */
async function geminiFetch(url: string, body: unknown, { attempts = 3, timeoutMs = 120_000 } = {}): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey("gemini"), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Délai dépassé ou coupure réseau : on réessaie
      if (attempt >= attempts) {
        throw new ProviderError(`Gemini sans réponse (${(error as Error).name})`, 504, true);
      }
      console.warn(`[gemini] pas de réponse (${(error as Error).name}), tentative ${attempt + 1}/${attempts}`);
      continue;
    }
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= attempts) {
      throw new ProviderError(`Gemini HTTP ${res.status} ${text.slice(0, 300)}`, res.status, retryable);
    }
    // Gemini indique le délai à respecter quand le quota par minute est atteint ("retryDelay": "17s")
    const hinted = Number(text.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/)?.[1]);
    const wait = (hinted || 5 * attempt) + 1;
    console.warn(`[gemini] HTTP ${res.status}, nouvelle tentative dans ${wait} s (${attempt + 1}/${attempts})`);
    await sleep(wait * 1000);
  }
}

/**
 * Embeddings par lots. taskType : RETRIEVAL_DOCUMENT pour les morceaux de cours,
 * RETRIEVAL_QUERY pour une question.
 */
export async function embed(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const vectors: number[][] = [];
  // Quota gratuit : 100 textes par minute. Au-delà de 100 morceaux, chaque lot suivant attend
  // que le quota se recharge (délai indiqué par Gemini), d'où plusieurs tentatives autorisées.
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const data = (await geminiFetch(
      `${BASE}/${EMBEDDING_MODEL}:batchEmbedContents`,
      {
        requests: batch.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      },
      { attempts: 5, timeoutMs: 60_000 },
    )) as { embeddings: { values: number[] }[] };
    vectors.push(...data.embeddings.map((e) => e.values));
  }
  return vectors;
}

/** Envoie un fichier (PDF, image) à Gemini avec une consigne, renvoie le texte produit. */
export async function readFileWithGemini(
  data: Uint8Array,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const body = (thinking: boolean) => ({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: Buffer.from(data).toString("base64") } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 65536,
      // Transcrire ne demande pas de raisonnement : réflexion réduite = 2x plus rapide,
      // même qualité (mesuré : 40 s -> 21 s pour 5 diapositives, autant de schémas décrits)
      ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
    },
  });
  let result: { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  try {
    result = (await geminiFetch(`${BASE}/${VISION_MODEL}:generateContent`, body(true))) as typeof result;
  } catch (error) {
    // Un modèle plus ancien ne connaît pas ce réglage : on réessaie sans
    if (!(error instanceof ProviderError && error.status === 400 && /thinking/i.test(error.message))) throw error;
    result = (await geminiFetch(`${BASE}/${VISION_MODEL}:generateContent`, body(false))) as typeof result;
  }
  return (
    result.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("") ?? ""
  );
}

import "server-only";
import { apiKey, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, markAvailable, markUnavailable, modelChain } from "./models";
import { ProviderError } from "./providers";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Appel Gemini avec nouvelles tentatives sur quota (429), surcharge (5xx) et requête bloquée.
 * timeoutMs : sans limite, une requête que Gemini ne termine jamais bloquerait le document
 * pendant des dizaines de minutes (5 min d'attente par défaut dans Node, à chaque tentative).
 */
async function geminiFetch(
  url: string,
  body: unknown,
  { attempts = 3, timeoutMs = 120_000, maxWaitMs = Infinity } = {},
): Promise<unknown> {
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
    // Quelqu'un attend la réponse (question du chat) : pas de longue pause, on abandonne
    if (wait * 1000 > maxWaitMs) {
      throw new ProviderError(`Gemini HTTP ${res.status} (attente de ${wait} s refusée)`, res.status, true);
    }
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
      // Question du chat : quelqu'un attend, réponse rapide ou abandon. Import : on patiente (quota par minute).
      taskType === "RETRIEVAL_QUERY" ? { attempts: 2, timeoutMs: 8_000, maxWaitMs: 3_000 } : { attempts: 5, timeoutMs: 60_000 },
    )) as { embeddings: { values: number[] }[] };
    vectors.push(...data.embeddings.map((e) => e.values));
  }
  return vectors;
}

/**
 * Envoie un fichier (PDF, image) à Gemini avec une consigne, renvoie le texte produit.
 * Un seul essai par modèle, avec un délai court : un modèle saturé ou muet est noté indisponible
 * et le suivant prend le relais (avant : jusqu'à 3 x 2 min perdues sur le même modèle saturé).
 * Si tous échouent, un second tour est tenté après une courte pause.
 */
export async function readFileWithGemini(
  data: Uint8Array,
  mimeType: string,
  prompt: string,
  { timeoutMs = 90_000 }: { timeoutMs?: number } = {},
): Promise<string> {
  const base64 = Buffer.from(data).toString("base64");
  const body = (thinking: boolean) => ({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 65536,
      // Transcrire ne demande pas de raisonnement : réflexion réduite = 2x plus rapide,
      // même qualité (mesuré : 40 s -> 21 s pour 5 diapositives, autant de schémas décrits)
      ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
    },
  });
  type Result = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

  let lastError: unknown;
  for (let round = 0; round < 2; round++) {
    if (round > 0) await sleep(10_000);
    for (const model of modelChain("vision")) {
      const id = model.split(":")[1];
      const started = Date.now();
      try {
        let result: Result;
        try {
          result = (await geminiFetch(`${BASE}/${id}:generateContent`, body(true), { attempts: 1, timeoutMs })) as Result;
        } catch (error) {
          // Un modèle qui ne connaît pas ce réglage de réflexion : même modèle, sans réglage
          if (!(error instanceof ProviderError && error.status === 400 && /thinking/i.test(error.message))) throw error;
          result = (await geminiFetch(`${BASE}/${id}:generateContent`, body(false), { attempts: 1, timeoutMs })) as Result;
        }
        const text =
          result.candidates?.[0]?.content?.parts
            ?.filter((p) => !p.thought)
            .map((p) => p.text ?? "")
            .join("") ?? "";
        if (!text.trim()) throw new ProviderError(`${id} : réponse vide`, 502, true);
        markAvailable(model);
        console.log(`[lecture] ${id} : ${((Date.now() - started) / 1000).toFixed(1)} s`);
        return text;
      } catch (error) {
        lastError = error;
        if (error instanceof ProviderError && !error.retryable && error.status !== 404) throw error;
        // Quota par minute : Gemini indique le délai ; surcharge, délai dépassé, modèle retiré : 5 min
        const hinted = error instanceof ProviderError ? Number(error.message.match(/"retryDelay":\s*"(\d+)/)?.[1]) : NaN;
        markUnavailable(model, hinted ? (hinted + 1) * 1000 : 5 * 60_000);
        console.warn(`[lecture] ${id} indisponible (${(error as Error).message.slice(0, 120)}), modèle suivant`);
      }
    }
  }
  throw lastError ?? new Error("Aucun modèle de lecture disponible");
}

import "server-only";
import { apiKey, type ModelId } from "./models";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
};

/** Erreur après laquelle il vaut la peine d'essayer un autre modèle (quota, surcharge, contexte trop long). */
export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

async function check(res: Response, model: string) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  // 429 quota, 5xx surcharge, 413 / 400 "trop de tokens" : un autre modèle peut réussir
  const retryable = res.status === 429 || res.status >= 500 || res.status === 413 ||
    (res.status === 400 && /token|context|too large|length/i.test(body));
  throw new ProviderError(`${model} → HTTP ${res.status} ${body.slice(0, 300)}`, res.status, retryable);
}

// Lecture d'un flux Server-Sent Events ligne par ligne
async function* sseData(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

async function* streamGemini(model: string, req: ChatRequest): AsyncGenerator<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey("gemini"), "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 8192,
          temperature: req.temperature ?? 0.4,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  await check(res, model);
  for await (const data of sseData(res)) {
    const chunk = JSON.parse(data);
    const text = chunk.candidates?.[0]?.content?.parts
      ?.filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    if (text) yield text;
  }
}

// Groq et OpenRouter exposent la même API que OpenAI
async function* streamOpenAICompatible(
  provider: "groq" | "openrouter",
  model: string,
  req: ChatRequest,
): AsyncGenerator<string> {
  const url =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey(provider)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: req.maxTokens ?? 8192,
      temperature: req.temperature ?? 0.4,
      messages: [{ role: "system", content: req.system }, ...req.messages],
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  await check(res, model);
  for await (const data of sseData(res)) {
    if (data === "[DONE]") break;
    const text = JSON.parse(data).choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

function streamModel(model: ModelId, req: ChatRequest) {
  const [provider, ...rest] = model.split(":");
  const id = rest.join(":");
  if (provider === "gemini") return streamGemini(id, req);
  return streamOpenAICompatible(provider as "groq" | "openrouter", id, req);
}

/**
 * Génère une réponse en flux en essayant chaque modèle de la chaîne.
 * On ne bascule que si le modèle échoue AVANT d'avoir produit du texte
 * (sinon l'utilisateur verrait deux réponses mélangées).
 */
export async function* streamWithFallback(
  chain: ModelId[],
  req: ChatRequest,
  onModel?: (model: ModelId) => void,
): AsyncGenerator<string> {
  let lastError: unknown;
  for (const model of chain) {
    let started = false;
    try {
      onModel?.(model);
      for await (const text of streamModel(model, req)) {
        started = true;
        yield text;
      }
      if (started) return;
      lastError = new Error(`${model} n'a rien renvoyé`);
    } catch (error) {
      if (started) throw error;
      // Même une erreur non temporaire (clé invalide...) peut ne concerner qu'un fournisseur
      lastError = error;
      console.warn(`[ia] ${model} indisponible, modèle suivant`, (error as Error).message);
    }
  }
  throw lastError ?? new Error("Aucun modèle disponible");
}

/** Version non streamée (petites tâches, JSON). */
export async function generateWithFallback(chain: ModelId[], req: ChatRequest): Promise<string> {
  let text = "";
  for await (const part of streamWithFallback(chain, req)) text += part;
  return text;
}

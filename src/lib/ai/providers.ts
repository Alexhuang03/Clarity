import "server-only";
import { apiKey, type ModelId } from "./models";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** Petite tâche (classement, JSON) : réflexion minimale, réponse en ~1 s au lieu de plusieurs */
  fast?: boolean;
  /** Annule la requête (délai maximal) */
  signal?: AbortSignal;
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

/** Morceau de flux : texte de la réponse, ou réflexion du modèle (affichée à part). */
export type StreamChunk = { type: "text" | "thought"; text: string };

async function* streamGemini(model: string, req: ChatRequest): AsyncGenerator<StreamChunk> {
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
          // Gemini renvoie alors un résumé de sa réflexion (parties marquées "thought").
          // Petite tâche : réflexion minimale, sinon le modèle « léger » réfléchit plusieurs secondes.
          thinkingConfig: req.fast ? { thinkingLevel: "minimal" } : { includeThoughts: true },
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: req.signal,
    },
  );
  await check(res, model);
  for await (const data of sseData(res)) {
    const parts: { text?: string; thought?: boolean }[] = JSON.parse(data).candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) yield { type: part.thought ? "thought" : "text", text: part.text };
    }
  }
}

// Groq et OpenRouter exposent la même API que OpenAI
async function* streamOpenAICompatible(
  provider: "groq" | "openrouter",
  model: string,
  req: ChatRequest,
): AsyncGenerator<StreamChunk> {
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
      // Modèles de raisonnement (gpt-oss) : effort minimal pour les petites tâches
      ...(req.fast && /gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}),
    }),
    signal: req.signal,
  });
  await check(res, model);
  for await (const data of sseData(res)) {
    if (data === "[DONE]") break;
    // Les modèles de raisonnement (gpt-oss...) envoient leur réflexion dans "reasoning"
    const delta = JSON.parse(data).choices?.[0]?.delta ?? {};
    if (delta.reasoning) yield { type: "thought", text: delta.reasoning };
    if (delta.content) yield { type: "text", text: delta.content };
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
 * On ne bascule que si le modèle échoue AVANT d'avoir produit du texte de réponse
 * (sinon l'utilisateur verrait deux réponses mélangées). Une réflexion déjà affichée
 * reste visible, suivie d'une note indiquant le changement de modèle.
 */
export async function* streamWithFallback(
  chain: ModelId[],
  req: ChatRequest,
  onModel?: (model: ModelId) => void,
): AsyncGenerator<StreamChunk> {
  let lastError: unknown;
  let thought = false;
  for (const [index, model] of chain.entries()) {
    let started = false;
    try {
      onModel?.(model);
      if (index > 0 && thought) {
        yield { type: "thought", text: `\n\n*— Modèle indisponible, nouvel essai avec ${model.split(":")[1]} —*\n\n` };
      }
      for await (const chunk of streamModel(model, req)) {
        if (chunk.type === "text") started = true;
        else thought = true;
        yield chunk;
      }
      if (started) return;
      lastError = new Error(`${model} n'a rien renvoyé`);
    } catch (error) {
      if (started) throw error;
      // Même une erreur non temporaire (clé invalide...) peut ne concerner qu'un fournisseur
      lastError = error;
      // Délai dépassé : inutile d'essayer les modèles suivants avec un signal déjà annulé
      if (req.signal?.aborted) throw error;
      console.warn(`[ia] ${model} indisponible, modèle suivant`, (error as Error).message);
    }
  }
  throw lastError ?? new Error("Aucun modèle disponible");
}

/** Version non streamée (petites tâches, JSON) : seule la réponse compte. */
export async function generateWithFallback(chain: ModelId[], req: ChatRequest): Promise<string> {
  let text = "";
  for await (const chunk of streamWithFallback(chain, req)) if (chunk.type === "text") text += chunk.text;
  return text;
}

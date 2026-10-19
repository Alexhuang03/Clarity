import "server-only";
import type { ModelId } from "@/lib/ai/models";
import { streamWithFallback, type ChatRequest } from "@/lib/ai/providers";

// Événements envoyés au navigateur, une ligne JSON par événement (NDJSON)
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "done"; message: unknown }
  | { type: "error"; error: string };

export function ndjsonResponse(run: (send: (event: StreamEvent) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await run(send);
      } catch (error) {
        console.error("[ia] génération échouée", error);
        const message = error instanceof Error ? error.message : "";
        send({
          type: "error",
          error: /429|quota|RESOURCE_EXHAUSTED/i.test(message)
            ? "Les IA gratuites sont saturées pour le moment. Réessaie dans une minute."
            : "La génération a échoué. Réessaie.",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Génère une réponse en transmettant au navigateur la réflexion du modèle puis le texte.
 * Renvoie tout ce qu'il faut enregistrer avec le message.
 */
export async function streamAnswer(chain: ModelId[], req: ChatRequest, send: (event: StreamEvent) => void) {
  const startedAt = Date.now();
  let content = "";
  let thinking = "";
  let thinkingMs: number | null = null;
  let model: ModelId | null = null;
  for await (const chunk of streamWithFallback(chain, req, (m) => (model = m))) {
    if (chunk.type === "thought") {
      thinking += chunk.text;
      send({ type: "thinking", text: chunk.text });
    } else {
      // Durée de réflexion = temps écoulé avant le premier mot de la réponse
      if (thinkingMs === null && thinking) thinkingMs = Date.now() - startedAt;
      content += chunk.text;
      send({ type: "delta", text: chunk.text });
    }
  }
  return { content, thinking: thinking.trim() || null, thinkingMs, model: model as ModelId | null };
}

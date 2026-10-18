import "server-only";

// Événements envoyés au navigateur, une ligne JSON par événement (NDJSON)
export type StreamEvent =
  | { type: "delta"; text: string }
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

// Lecture côté navigateur du flux NDJSON envoyé par les routes /api/courses/[id]/...
export type ClientStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; message: unknown }
  | { type: "error"; error: string };

export async function readStream(response: Response, onEvent: (event: ClientStreamEvent) => void) {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    onEvent({ type: "error", error: body.error ?? "La requête a échoué." });
    return;
  }
  const reader = response.body.getReader();
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
      if (line) onEvent(JSON.parse(line));
    }
  }
}

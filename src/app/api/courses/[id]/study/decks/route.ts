import { createDeck, createDeckSchema, listDecks } from "@/lib/study/flashcards";
import { handle, readBody, requireCourse, requireCourseContext } from "@/lib/study/http";
import type { DeckResponse, DeckSummary } from "@/lib/study/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    return Response.json({ decks: await listDecks(session) } satisfies { decks: DeckSummary[] });
  });
}

/** Génère un paquet de flashcards à partir du cours (ou crée un paquet vide avec empty: true). */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourseContext(params);
    const body = await readBody(request, createDeckSchema);
    return Response.json((await createDeck(session, body)) satisfies DeckResponse, { status: 201 });
  });
}

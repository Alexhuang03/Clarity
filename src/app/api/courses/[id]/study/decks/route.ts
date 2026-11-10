import { createDeck, createDeckSchema, listDecks } from "@/lib/study/flashcards";
import { handle, readBody, requireCourse, requireCourseContext } from "@/lib/study/http";
import { StudyError } from "@/lib/study/llm";
import type { DeckResponse, DeckSummary } from "@/lib/study/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Paquets du cours. ?before=date ISO (facultatif) : dueCount compte les cartes dues d'ici là (défaut maintenant). */
export function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const rawBefore = new URL(request.url).searchParams.get("before");
    let before: Date | undefined;
    if (rawBefore) {
      before = new Date(rawBefore);
      if (Number.isNaN(before.getTime())) throw new StudyError("Paramètre before invalide (date ISO attendue)");
    }
    return Response.json({ decks: await listDecks(session, before) } satisfies { decks: DeckSummary[] });
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

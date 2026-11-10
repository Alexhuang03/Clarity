import { createCard, createCardSchema } from "@/lib/study/flashcards";
import { assertUuid, handle, readBody, requireCourse } from "@/lib/study/http";
import type { CardResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; deckId: string }> };

/** Ajoute une carte écrite à la main. */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const deckId = assertUuid((await params).deckId, "Paquet");
    const body = await readBody(request, createCardSchema);
    return Response.json({ card: await createCard(session, deckId, body) } satisfies CardResponse, { status: 201 });
  });
}

import { deleteDeck, getDeck, renameDeck, updateDeckSchema } from "@/lib/study/flashcards";
import { assertUuid, handle, readBody, requireCourse } from "@/lib/study/http";
import type { DeckResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; deckId: string }> };

export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    return Response.json((await getDeck(session, assertUuid((await params).deckId, "Paquet"))) satisfies DeckResponse);
  });
}

export function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const deckId = assertUuid((await params).deckId, "Paquet");
    const { title } = await readBody(request, updateDeckSchema);
    return Response.json((await renameDeck(session, deckId, title)) satisfies DeckResponse);
  });
}

export function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    await deleteDeck(session, assertUuid((await params).deckId, "Paquet"));
    return Response.json({ ok: true });
  });
}

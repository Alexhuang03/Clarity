import { deleteCard, updateCard, updateCardSchema } from "@/lib/study/flashcards";
import { assertUuid, handle, readBody, requireCourse } from "@/lib/study/http";
import type { CardResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; cardId: string }> };

export function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const cardId = assertUuid((await params).cardId, "Carte");
    const body = await readBody(request, updateCardSchema);
    return Response.json({ card: await updateCard(session, cardId, body) } satisfies CardResponse);
  });
}

export function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    await deleteCard(session, assertUuid((await params).cardId, "Carte"));
    return Response.json({ ok: true });
  });
}

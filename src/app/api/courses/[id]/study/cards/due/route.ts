import { dueCards } from "@/lib/study/flashcards";
import { assertUuid, handle, requireCourse } from "@/lib/study/http";
import { StudyError } from "@/lib/study/llm";
import type { DueCardsResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string }> };

/** Cartes à réviser : ?deckId=… (facultatif), ?limit=1-200 (défaut 50), ?before=date ISO (défaut maintenant). */
export function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const search = new URL(request.url).searchParams;
    const rawDeck = search.get("deckId");
    const deckId = rawDeck ? assertUuid(rawDeck, "Paquet") : undefined;
    const limit = Math.min(200, Math.max(1, Number.parseInt(search.get("limit") ?? "50", 10) || 50));
    const rawBefore = search.get("before");
    let before: Date | undefined;
    if (rawBefore) {
      before = new Date(rawBefore);
      if (Number.isNaN(before.getTime())) throw new StudyError("Paramètre before invalide (date ISO attendue)");
    }
    return Response.json((await dueCards(session, { deckId, before, limit })) satisfies DueCardsResponse);
  });
}

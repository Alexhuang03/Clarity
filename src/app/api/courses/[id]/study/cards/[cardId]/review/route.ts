import { reviewCard, reviewSchema } from "@/lib/study/flashcards";
import { assertUuid, handle, readBody, requireCourse } from "@/lib/study/http";
import type { ReviewResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; cardId: string }> };

/** Note une révision (again / hard / good / easy) et calcule la prochaine échéance (SM-2). */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const cardId = assertUuid((await params).cardId, "Carte");
    const { rating } = await readBody(request, reviewSchema);
    return Response.json((await reviewCard(session, cardId, rating)) satisfies ReviewResponse);
  });
}

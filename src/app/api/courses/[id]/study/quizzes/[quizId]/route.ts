import { assertUuid, handle, requireCourse } from "@/lib/study/http";
import { deleteQuiz, getQuiz } from "@/lib/study/quizzes";
import type { QuizDetailResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; quizId: string }> };

/** Quiz (sans les réponses) et ses tentatives. */
export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const quizId = assertUuid((await params).quizId, "Quiz");
    return Response.json((await getQuiz(session, quizId)) satisfies QuizDetailResponse);
  });
}

export function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    await deleteQuiz(session, assertUuid((await params).quizId, "Quiz"));
    return Response.json({ ok: true });
  });
}

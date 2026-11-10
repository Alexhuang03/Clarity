import { assertUuid, handle, requireCourse } from "@/lib/study/http";
import { startAttempt } from "@/lib/study/quizzes";
import type { AttemptSummary } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; quizId: string }> };

/** Nouvelle tentative (refaire un quiz) : le chrono d'un examen blanc démarre maintenant. */
export function POST(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const attempt = await startAttempt(session, assertUuid((await params).quizId, "Quiz"));
    return Response.json({ attempt } satisfies { attempt: AttemptSummary }, { status: 201 });
  });
}

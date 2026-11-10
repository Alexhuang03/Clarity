import { assertUuid, handle, readBody, requireCourse, requireCourseContext } from "@/lib/study/http";
import { getAttempt, saveDraft, submitAttempt, submitSchema } from "@/lib/study/quizzes";
import type { AttemptResponse } from "@/lib/study/types";

// Correction des réponses rédigées par l'IA
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string; quizId: string; attemptId: string }> };

/** État d'une tentative : en cours, ou remise avec la correction complète. */
export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const { quizId, attemptId } = await params;
    const result = await getAttempt(session, assertUuid(quizId, "Quiz"), assertUuid(attemptId, "Tentative"));
    return Response.json(result satisfies AttemptResponse);
  });
}

/** Remise des réponses et correction (renvoie la correction existante si déjà remise). */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourseContext(params);
    const { quizId, attemptId } = await params;
    const { answers } = await readBody(request, submitSchema);
    const result = await submitAttempt(session, assertUuid(quizId, "Quiz"), assertUuid(attemptId, "Tentative"), answers);
    return Response.json(result satisfies AttemptResponse);
  });
}

/** Enregistre le brouillon des réponses d'une tentative en cours (corps : { answers }). */
export function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const { quizId, attemptId } = await params;
    const { answers } = await readBody(request, submitSchema);
    await saveDraft(session, assertUuid(quizId, "Quiz"), assertUuid(attemptId, "Tentative"), answers);
    return Response.json({ ok: true });
  });
}

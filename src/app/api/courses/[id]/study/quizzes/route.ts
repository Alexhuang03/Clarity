import { handle, readBody, requireCourse, requireCourseContext } from "@/lib/study/http";
import { createQuiz, createQuizSchema, listQuizzes } from "@/lib/study/quizzes";
import type { CreateQuizResponse, QuizSummary } from "@/lib/study/types";

// Génération par l'IA : plusieurs essais de modèles possibles
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Liste des quiz, examens blancs et tests rapides du cours. */
export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    return Response.json({ quizzes: await listQuizzes(session) } satisfies { quizzes: QuizSummary[] });
  });
}

/** Génère un quiz / examen blanc / test rapide et démarre une première tentative. */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourseContext(params);
    const body = await readBody(request, createQuizSchema);
    return Response.json((await createQuiz(session, body)) satisfies CreateQuizResponse, { status: 201 });
  });
}

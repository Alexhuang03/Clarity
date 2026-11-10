import "server-only";
import { modelChain } from "@/lib/ai/models";
import { loadConceptContent, loadScopedContent, type CourseContext } from "./content";
import { dbError, enforceLimit, enforceStudyLimit, scopeSchema, trustedClient, type Session } from "./http";
import { generateJson, StudyError } from "./llm";
import { computeMastery, knownConcepts, recordConceptEvents, weakConcepts } from "./mastery";
import { conceptsBlock, quizPrompt } from "./prompts";
import { gradeAttempt, quizSchema, sanitizeAnswer, toPublic } from "./quiz";
import type {
  AnswerValue,
  Answers,
  AttemptResponse,
  AttemptResult,
  AttemptSummary,
  CreateQuizRequest,
  CreateQuizResponse,
  Difficulty,
  PublicQuestion,
  PublicQuiz,
  Question,
  QuestionResult,
  QuestionType,
  QuizConfig,
  QuizDetailResponse,
  QuizMode,
  QuizSummary,
} from "./types";
import { v, type Schema } from "./validate";

// Budgets de cours envoyés à l'IA (caractères, ~4 par token)
const BUDGET: Record<QuizMode, number> = { quiz: 45_000, exam: 50_000, quick: 15_000 };
// Marge accordée après la fin d'un examen blanc (latence réseau, envoi automatique)
const LATE_GRACE_MS = 2 * 60_000;
const LIST_MAX = 100;

const difficulty = v.optional(v.literal<Difficulty | "mixte">("facile", "moyen", "difficile", "mixte"), "mixte");

export const createQuizSchema: Schema<CreateQuizRequest> = (input, path) => {
  const mode = (input as { mode?: unknown } | null)?.mode;
  if (mode === "exam") {
    return v.object({
      mode: v.literal("exam"),
      durationMinutes: v.optional(v.number({ int: true, min: 5, max: 240 }), 60),
      count: v.optional(v.number({ int: true, min: 4, max: 25 }), 10),
      difficulty,
      scope: scopeSchema,
    })(input, path);
  }
  if (mode === "quick") {
    return v.object({
      mode: v.literal("quick"),
      targetWeak: v.optional(v.boolean(), true),
      scope: scopeSchema,
    })(input, path);
  }
  return v.object({
    // mode absent = quiz
    mode: v.optional(v.literal("quiz"), "quiz"),
    count: v.optional(v.number({ int: true, min: 3, max: 30 }), 10),
    difficulty,
    types: v.optional(
      v.array(v.literal<Exclude<QuestionType, "open">>("single", "multiple", "truefalse", "short"), { min: 1, max: 4 }),
      ["single", "multiple", "truefalse", "short"],
    ),
    scope: scopeSchema,
  })(input, path);
};

export const submitSchema = v.object({
  answers: v.refine(v.any(), (a) =>
    typeof a === "object" && a !== null && !Array.isArray(a) && Object.keys(a).length <= 100 ? null : "objet { idQuestion: réponse } attendu",
  ) as Schema<Answers>,
});

// ------------------------------------------------------------------ Conversions ligne → API
//
// Intégrité (migration 20261110000200) : study_quizzes.questions ne contient que les questions publiques ;
// le corrigé est dans study_quiz_keys, illisible pour l'utilisateur. Les tentatives (démarrage, réponses,
// notes) sont écrites uniquement par le serveur (trustedClient), après vérification de la propriété.

type QuizRow = {
  id: string;
  course_id: string;
  mode: QuizMode;
  title: string;
  config: QuizConfig;
  questions: PublicQuestion[];
  question_count: number;
  time_limit_sec: number | null;
  created_at: string;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  started_at: string;
  deadline_at: string | null;
  answered_at: string | null;
  submitted_at: string | null;
  late: boolean;
  score: number | null;
  max_score: number | null;
  answers: Answers;
  results: QuestionResult[];
  feedback: string | null;
};

const QUIZ_COLUMNS = "id, course_id, mode, title, config, questions, question_count, time_limit_sec, created_at";
const ATTEMPT_COLUMNS =
  "id, quiz_id, started_at, deadline_at, answered_at, submitted_at, late, score, max_score, answers, results, feedback";
const SUMMARY_COLUMNS = "id, started_at, deadline_at, submitted_at, late, score, max_score";

const percentOf = (score: number | null, max: number | null) =>
  score === null || !max ? null : Math.round((Number(score) / Number(max)) * 1000) / 10;

export function toAttemptSummary(a: Omit<AttemptRow, "answers" | "results" | "feedback" | "answered_at" | "quiz_id">): AttemptSummary {
  const submitted = !!a.submitted_at;
  return {
    id: a.id,
    startedAt: a.started_at,
    deadlineAt: a.deadline_at,
    submittedAt: a.submitted_at,
    score: submitted && a.score !== null ? Number(a.score) : null,
    maxScore: submitted && a.max_score !== null ? Number(a.max_score) : null,
    percent: submitted ? percentOf(a.score, a.max_score) : null,
    late: a.late,
  };
}

function toAttemptResult(a: AttemptRow, questions: Question[]): AttemptResult {
  return {
    ...toAttemptSummary(a),
    quizId: a.quiz_id,
    submittedAt: a.submitted_at!,
    score: Number(a.score),
    maxScore: Number(a.max_score),
    percent: percentOf(a.score, a.max_score) ?? 0,
    feedback: a.feedback,
    results: a.results,
    questions,
  };
}

function toPublicQuiz(q: QuizRow): PublicQuiz {
  return {
    id: q.id,
    courseId: q.course_id,
    mode: q.mode,
    title: q.title,
    config: q.config,
    timeLimitSec: q.time_limit_sec,
    // Déjà publiques en base ; toPublic garantit la forme même pour d'anciennes lignes
    questions: (q.questions as unknown as Question[]).map(toPublic),
    createdAt: q.created_at,
  };
}

// ------------------------------------------------------------------ Création

export async function createQuiz(
  { supabase, userId, courseId, ctx }: Session & { ctx: CourseContext },
  body: CreateQuizRequest,
): Promise<CreateQuizResponse> {
  // Avant tout : le test rapide interroge aussi l'API d'embeddings
  await enforceStudyLimit(userId);
  const mode = body.mode;
  const scope = body.scope ?? {};
  let config: QuizConfig;
  let timeLimitSec: number | null = null;
  if (body.mode === "exam") {
    config = { count: body.count ?? 10, difficulty: body.difficulty ?? "mixte", types: ["single", "multiple", "truefalse", "short", "open"], scope };
    timeLimitSec = (body.durationMinutes ?? 60) * 60;
  } else if (body.mode === "quick") {
    config = { count: 5, difficulty: "mixte", types: ["single", "truefalse"], scope, targetConcepts: [] };
  } else {
    config = { count: body.count ?? 10, difficulty: body.difficulty ?? "mixte", types: body.types ?? ["single", "multiple", "truefalse", "short"], scope };
  }

  // Test rapide : vise les notions faibles s'il existe des données de progression
  if (body.mode === "quick" && body.targetWeak !== false) {
    config.targetConcepts = weakConcepts(await computeMastery(supabase, courseId)).map((c) => c.label);
  }
  const hasScope = !!(scope.partIds?.length || scope.documentIds?.length);
  const [content, known] = await Promise.all([
    config.targetConcepts?.length && !hasScope
      ? loadConceptContent(supabase, ctx, config.targetConcepts, BUDGET.quick)
      : loadScopedContent(supabase, ctx, scope, BUDGET[mode], { shuffle: true }),
    knownConcepts(supabase, courseId),
  ]);

  const perQuestion = mode === "exam" ? 650 : 400;
  const { value, model } = await generateJson(
    modelChain("study"),
    {
      system: quizPrompt({
        mode,
        count: config.count,
        difficulty: config.difficulty,
        types: config.types,
        hasTargets: !!config.targetConcepts?.length,
        hasKnown: known.length > 0,
      }),
      user: [conceptsBlock({ target: config.targetConcepts, known }), content.block].filter(Boolean).join("\n\n"),
      maxTokens: Math.min(16384, 1500 + config.count * perQuestion),
      temperature: 0.6,
      beforeRetry: () => enforceStudyLimit(userId),
    },
    quizSchema({ count: config.count, types: config.types, sources: content.sources, quick: mode === "quick" }),
    `génération ${mode}`,
  );

  const title = mode === "quick" ? `Test rapide — ${value.title}` : mode === "exam" ? `Examen blanc — ${value.title}` : value.title;
  // Le quiz (questions publiques) est inséré avec le client de la requête : la RLS vérifie le cours
  const { data: quiz, error } = await supabase
    .from("study_quizzes")
    .insert({
      user_id: userId,
      course_id: courseId,
      mode,
      title: title.slice(0, 200),
      config,
      questions: value.questions.map(toPublic),
      question_count: value.questions.length,
      time_limit_sec: timeLimitSec,
      model,
    })
    .select(QUIZ_COLUMNS)
    .single();
  if (error || !quiz) dbError(error);
  // Le corrigé, par le serveur seulement
  const { error: keyError } = await trustedClient()
    .from("study_quiz_keys")
    .insert({ quiz_id: quiz.id, user_id: userId, course_id: courseId, questions: value.questions });
  if (keyError) {
    await supabase.from("study_quizzes").delete().eq("id", quiz.id);
    dbError(keyError);
  }
  const attempt = await startAttempt({ supabase, userId, courseId }, quiz.id, quiz.time_limit_sec);
  return { quiz: toPublicQuiz(quiz as QuizRow), attempt };
}

// ------------------------------------------------------------------ Lecture

export async function listQuizzes({ supabase, courseId }: Session): Promise<QuizSummary[]> {
  const [{ data: quizzes, error }, { data: attempts }] = await Promise.all([
    supabase
      .from("study_quizzes")
      .select("id, mode, title, question_count, time_limit_sec, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(LIST_MAX),
    supabase
      .from("study_attempts")
      .select("quiz_id, score, max_score, submitted_at")
      .eq("course_id", courseId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true })
      .limit(2000),
  ]);
  if (error) dbError(error);
  const stats = new Map<string, { count: number; best: number | null; last: number | null }>();
  for (const a of attempts ?? []) {
    const p = percentOf(a.score, a.max_score);
    const s = stats.get(a.quiz_id) ?? { count: 0, best: null, last: null };
    s.count += 1;
    s.last = p;
    if (p !== null && (s.best === null || p > s.best)) s.best = p;
    stats.set(a.quiz_id, s);
  }
  return (quizzes ?? []).map((q) => ({
    id: q.id,
    mode: q.mode,
    title: q.title,
    questionCount: q.question_count,
    timeLimitSec: q.time_limit_sec,
    createdAt: q.created_at,
    attemptCount: stats.get(q.id)?.count ?? 0,
    bestPercent: stats.get(q.id)?.best ?? null,
    lastPercent: stats.get(q.id)?.last ?? null,
  }));
}

/** Quiz de l'utilisateur (client de la requête : la RLS garantit la propriété). */
async function loadQuiz({ supabase, courseId }: Session, quizId: string): Promise<QuizRow> {
  const { data, error } = await supabase.from("study_quizzes").select(QUIZ_COLUMNS).eq("id", quizId).eq("course_id", courseId).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Quiz introuvable", 404);
  return data as QuizRow;
}

/** Corrigé complet d'un quiz dont la propriété a DÉJÀ été vérifiée (loadQuiz). */
async function loadKey(userId: string, quizId: string): Promise<Question[]> {
  const { data, error } = await trustedClient()
    .from("study_quiz_keys")
    .select("questions")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Corrigé introuvable pour ce quiz.", 500);
  return data.questions as Question[];
}

export async function getQuiz(session: Session, quizId: string): Promise<QuizDetailResponse> {
  const quiz = await loadQuiz(session, quizId);
  const { data: attempts, error } = await session.supabase
    .from("study_attempts")
    .select(SUMMARY_COLUMNS)
    .eq("quiz_id", quizId)
    .order("started_at", { ascending: false })
    .limit(LIST_MAX);
  if (error) dbError(error);
  return { quiz: toPublicQuiz(quiz), attempts: (attempts ?? []).map(toAttemptSummary) };
}

export async function deleteQuiz({ supabase, courseId }: Session, quizId: string) {
  // Corrigé et tentatives supprimés en cascade
  const { data, error } = await supabase.from("study_quizzes").delete().eq("id", quizId).eq("course_id", courseId).select("id");
  if (error) dbError(error);
  if (!data?.length) throw new StudyError("Quiz introuvable", 404);
}

// ------------------------------------------------------------------ Tentatives

export async function startAttempt(session: Session, quizId: string, timeLimitSec?: number | null): Promise<AttemptSummary> {
  const { userId, courseId } = session;
  await enforceLimit(userId, "study:attempt", { limit: 30, windowSec: 600 });
  // Propriété du quiz vérifiée par la RLS (sauf juste après sa création par cet utilisateur)
  const limit = timeLimitSec === undefined ? (await loadQuiz(session, quizId)).time_limit_sec : timeLimitSec;
  const { data, error } = await trustedClient()
    .from("study_attempts")
    .insert({
      user_id: userId,
      course_id: courseId,
      quiz_id: quizId,
      deadline_at: limit ? new Date(Date.now() + limit * 1000).toISOString() : null,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error || !data) dbError(error);
  return toAttemptSummary(data);
}

/** Tentative de l'utilisateur (client de la requête : la RLS garantit la propriété). */
async function loadAttempt({ supabase }: Session, quizId: string, attemptId: string): Promise<AttemptRow> {
  const { data, error } = await supabase.from("study_attempts").select(ATTEMPT_COLUMNS).eq("id", attemptId).eq("quiz_id", quizId).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Tentative introuvable", 404);
  return data as AttemptRow;
}

export async function getAttempt(session: Session, quizId: string, attemptId: string): Promise<AttemptResponse> {
  await loadQuiz(session, quizId);
  const attempt = await loadAttempt(session, quizId, attemptId);
  return attempt.submitted_at
    ? { status: "submitted", attempt: toAttemptResult(attempt, await loadKey(session.userId, quizId)) }
    : { status: "in_progress", attempt: toAttemptSummary(attempt) };
}

/**
 * Remise d'une tentative. Les réponses sont enregistrées AVANT la correction : si l'IA échoue,
 * un nouvel envoi relance la correction avec les réponses déjà enregistrées (impossible de les changer après coup).
 */
export async function submitAttempt(
  session: Session & { ctx: CourseContext },
  quizId: string,
  attemptId: string,
  rawAnswers: Answers,
): Promise<AttemptResponse> {
  const { supabase, userId, courseId } = session;
  const quiz = await loadQuiz(session, quizId);
  let attempt = await loadAttempt(session, quizId, attemptId);
  const questions = await loadKey(userId, quizId);
  if (attempt.submitted_at) return { status: "submitted", attempt: toAttemptResult(attempt, questions) };

  const trusted = trustedClient();
  if (!attempt.answered_at) {
    const answers: Record<string, AnswerValue> = {};
    for (const q of questions) answers[q.id] = sanitizeAnswer(q, rawAnswers[q.id]);
    const now = new Date();
    const late = !!attempt.deadline_at && now.getTime() > new Date(attempt.deadline_at).getTime() + LATE_GRACE_MS;
    const { data, error } = await trusted
      .from("study_attempts")
      .update({ answers, answered_at: now.toISOString(), late })
      .eq("id", attemptId)
      .eq("user_id", userId)
      .is("answered_at", null)
      .select(ATTEMPT_COLUMNS)
      .maybeSingle();
    if (error) dbError(error);
    // Envoi simultané : l'autre requête a déjà enregistré les réponses
    attempt = (data as AttemptRow | null) ?? (await loadAttempt(session, quizId, attemptId));
  }

  if (questions.some((q) => q.type === "short" || q.type === "open")) await enforceStudyLimit(userId);
  let grading;
  try {
    grading = await gradeAttempt(modelChain("study"), quiz.mode, questions, attempt.answers, () => enforceStudyLimit(userId));
  } catch (error) {
    if (error instanceof StudyError) {
      throw new StudyError(`${error.message} Tes réponses sont enregistrées : relance la correction.`, error.status, error.headers);
    }
    throw error;
  }

  const { data: saved, error } = await trusted
    .from("study_attempts")
    .update({
      score: grading.score,
      max_score: grading.maxScore,
      results: grading.results,
      feedback: grading.feedback,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("user_id", userId)
    .is("submitted_at", null)
    .select(ATTEMPT_COLUMNS)
    .maybeSingle();
  if (error) dbError(error);
  if (!saved) return getAttempt(session, quizId, attemptId);

  await recordConceptEvents(
    supabase,
    courseId,
    userId,
    questions.map((q, i) => ({
      concept: q.concept,
      score: grading.results[i].maxScore ? grading.results[i].score / grading.results[i].maxScore : 0,
      source: quiz.mode,
      refId: attemptId,
    })),
  );
  return { status: "submitted", attempt: toAttemptResult(saved as AttemptRow, questions) };
}

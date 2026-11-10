import "server-only";
import { dbError, type Session } from "./http";
import { computeMastery, weakConcepts } from "./mastery";
import { toAttemptSummary } from "./quizzes";
import type { QuizMode, StatsResponse } from "./types";

const DAY_MS = 86_400_000;
const utcDay = (iso: string | number) => new Date(iso).toISOString().slice(0, 10);

/** Jours consécutifs d'activité jusqu'à aujourd'hui (ou hier, si rien encore aujourd'hui). */
function streak(days: Set<string>): number {
  let cursor = Date.now();
  if (!days.has(utcDay(cursor))) cursor -= DAY_MS;
  let n = 0;
  while (days.has(utcDay(cursor))) {
    n += 1;
    cursor -= DAY_MS;
  }
  return n;
}

export async function courseStats(session: Session): Promise<StatsResponse> {
  const { supabase, courseId } = session;
  const nowIso = new Date().toISOString();
  const [concepts, attempts, cardsTotal, cardsDue, reviews] = await Promise.all([
    computeMastery(supabase, courseId),
    supabase
      .from("study_attempts")
      .select("id, quiz_id, started_at, deadline_at, submitted_at, late, score, max_score, study_quizzes(mode, title)")
      .eq("course_id", courseId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(500),
    supabase.from("study_flashcards").select("id", { count: "exact", head: true }).eq("course_id", courseId),
    supabase
      .from("study_flashcards")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("suspended", false)
      .lte("due_at", nowIso),
    supabase
      .from("study_card_reviews")
      .select("reviewed_at")
      .eq("course_id", courseId)
      .gte("reviewed_at", new Date(Date.now() - 60 * DAY_MS).toISOString())
      .limit(10_000),
  ]);
  for (const r of [attempts, cardsTotal, cardsDue, reviews]) if (r.error) dbError(r.error);

  const submitted = attempts.data ?? [];
  const percents = submitted
    .filter((a) => a.max_score && Number(a.max_score) > 0)
    .map((a) => (Number(a.score) / Number(a.max_score)) * 100);
  const weekAgo = Date.now() - 7 * DAY_MS;
  const activeDays = new Set([
    ...submitted.map((a) => utcDay(a.submitted_at!)),
    ...(reviews.data ?? []).map((r) => utcDay(r.reviewed_at)),
  ]);

  return {
    concepts,
    weakConcepts: weakConcepts(concepts),
    totals: {
      quizzesTaken: submitted.length,
      averagePercent: percents.length ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10 : null,
      cardsTotal: cardsTotal.count ?? 0,
      cardsDue: cardsDue.count ?? 0,
      reviewsLast7Days: (reviews.data ?? []).filter((r) => new Date(r.reviewed_at).getTime() >= weekAgo).length,
      streakDays: streak(activeDays),
    },
    recentAttempts: submitted.slice(0, 10).map((a) => {
      // Relation many-to-one : PostgREST renvoie un objet (typé tableau sans types générés)
      const quiz = (Array.isArray(a.study_quizzes) ? a.study_quizzes[0] : a.study_quizzes) as
        | { mode: QuizMode; title: string }
        | null
        | undefined;
      return { ...toAttemptSummary(a), quizId: a.quiz_id, mode: quiz?.mode ?? "quiz", title: quiz?.title ?? "Quiz" };
    }),
  };
}

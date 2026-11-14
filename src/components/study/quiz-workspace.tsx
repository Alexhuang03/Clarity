"use client";

import { useState } from "react";
import type {
  AttemptResponse,
  AttemptResult,
  Answers,
  AttemptSummary,
  CreateQuizRequest,
  CreateQuizResponse,
  PublicQuiz,
  QuizDetailResponse,
  QuizMode,
  QuizSummary,
} from "@/lib/study/types";
import { errorMessage, formatDate, studyApi } from "./api";
import { QuizPlayer } from "./quiz-player";
import { QuizResults } from "./quiz-results";
import { DeleteButton, ErrorNote, Generating, ListSkeleton, SectionTitle, scoreTone } from "./ui";
import { useStudyResource } from "./use-study";
import { useT } from "@/lib/i18n/client";

type View =
  | { kind: "home" }
  | { kind: "generating" }
  | { kind: "loading" }
  | { kind: "detail"; quiz: PublicQuiz; attempts: AttemptSummary[] }
  | { kind: "play"; quiz: PublicQuiz; attempt: AttemptSummary; answers?: Answers }
  | { kind: "result"; quiz: PublicQuiz; result: AttemptResult };


/**
 * Cycle commun au quiz, à l'examen blanc et au test rapide : configuration (fournie par la page),
 * génération, déroulé, correction, historique des tentatives.
 */
export function QuizWorkspace({
  courseId,
  mode,
  renderConfig,
  generatingHint,
  historyTitle,
}: {
  courseId: string;
  mode: QuizMode;
  /** Formulaire de configuration ; start lance la génération */
  renderConfig: (start: (request: CreateQuizRequest) => void) => React.ReactNode;
  generatingHint?: string;
  historyTitle?: string;
}) {
  const [view, setView] = useState<View>({ kind: "home" });
  const [error, setError] = useState<string | null>(null);
  const { t, intl } = useT();
  const history = useStudyResource<{ quizzes: QuizSummary[] }>(courseId, "/quizzes");
  const quizzes = history.data?.quizzes.filter((q) => q.mode === mode) ?? [];

  async function run(next: () => Promise<View>, pending: View = { kind: "loading" }) {
    const previous = view;
    setError(null);
    setView(pending);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      setView(await next());
    } catch (e) {
      setError(errorMessage(e));
      setView(previous.kind === "generating" || previous.kind === "loading" ? { kind: "home" } : previous);
    }
  }

  const start = (request: CreateQuizRequest) =>
    run(async () => {
      const { quiz, attempt } = await studyApi<CreateQuizResponse>(courseId, "/quizzes", { method: "POST", body: request });
      history.reload();
      return { kind: "play", quiz, attempt };
    }, { kind: "generating" });

  const openQuiz = (id: string) =>
    run(async () => {
      const { quiz, attempts } = await studyApi<QuizDetailResponse>(courseId, `/quizzes/${id}`);
      return { kind: "detail", quiz, attempts };
    });

  const retry = (quiz: PublicQuiz) =>
    run(async () => {
      const { attempt } = await studyApi<{ attempt: AttemptSummary }>(courseId, `/quizzes/${quiz.id}/attempts`, {
        method: "POST",
      });
      return { kind: "play", quiz, attempt };
    });

  const loadAttempt = async (quiz: PublicQuiz, attemptId: string): Promise<View> => {
    const res = await studyApi<AttemptResponse>(courseId, `/quizzes/${quiz.id}/attempts/${attemptId}`);
    return res.status === "submitted"
      ? { kind: "result", quiz, result: res.attempt }
      : { kind: "play", quiz, attempt: res.attempt, answers: res.answers };
  };

  const openAttempt = (quiz: PublicQuiz, attempt: AttemptSummary) => run(() => loadAttempt(quiz, attempt.id));

  /** Reprise directe depuis la liste : quiz + brouillon de la tentative en cours. */
  const resume = (quizId: string, attemptId: string) =>
    run(async () => {
      const { quiz } = await studyApi<QuizDetailResponse>(courseId, `/quizzes/${quizId}`);
      return loadAttempt(quiz, attemptId);
    });

  async function remove(id: string) {
    try {
      await studyApi(courseId, `/quizzes/${id}`, { method: "DELETE" });
      history.setData((d) => (d ? { quizzes: d.quizzes.filter((q) => q.id !== id) } : d));
      if (view.kind !== "home") setView({ kind: "home" });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const back = () => {
    setView({ kind: "home" });
    history.reload();
  };

  if (view.kind === "generating") {
    return <Generating hint={generatingHint} />;
  }
  if (view.kind === "loading") {
    return <ListSkeleton rows={4} />;
  }
  if (view.kind === "play") {
    return (
      <QuizPlayer
        key={view.attempt.id}
        courseId={courseId}
        quiz={view.quiz}
        attempt={view.attempt}
        initialAnswers={view.answers}
        onGraded={(result) => {
          setView({ kind: "result", quiz: view.quiz, result });
          history.reload();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onQuit={back}
      />
    );
  }
  if (view.kind === "result") {
    return (
      <>
        <ErrorNote message={error} />
        <QuizResults
          result={view.result}
          title={view.quiz.title}
          actions={
            <>
              <button type="button" onClick={() => retry(view.quiz)} className="btn btn-primary">
                {t.study.redo}
              </button>
              <button type="button" onClick={() => openQuiz(view.quiz.id)} className="btn btn-secondary">
                {t.study.attemptHistory}
              </button>
              <button type="button" onClick={back} className="btn btn-ghost">
                {t.study.finish}
              </button>
            </>
          }
        />
      </>
    );
  }
  if (view.kind === "detail") {
    const { quiz, attempts } = view;
    return (
      <div className="mx-auto max-w-2xl">
        <button type="button" onClick={back} className="btn btn-ghost -ml-3 mb-4 px-3 py-1.5 font-normal">
          ← {t.common.back}
        </button>
        <div className="card p-6">
          <p className="eyebrow">{t.study.modes[quiz.mode]}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{quiz.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {t.study.questionsCount(quiz.questions.length)}
            {quiz.timeLimitSec ? ` · ${Math.round(quiz.timeLimitSec / 60)} min` : ""} · {t.study.createdOn(formatDate(quiz.createdAt, intl))}
          </p>
          {quiz.config.targetConcepts && quiz.config.targetConcepts.length > 0 && (
            <p className="mt-2 text-sm text-muted">{t.study.targetConcepts(quiz.config.targetConcepts.join(", "))}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => retry(quiz)} className="btn btn-primary">
              {t.study.newAttempt}
            </button>
            <span className="ml-auto">
              <DeleteButton onDelete={() => remove(quiz.id)} />
            </span>
          </div>
        </div>
        <ErrorNote message={error} />
        <div className="mt-8">
          <SectionTitle>{t.study.attempts}</SectionTitle>
        </div>
        <ul className="space-y-2">
          {attempts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => openAttempt(quiz, a)}
                className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-line-strong"
              >
                <span className="min-w-0 flex-1 text-sm">
                  {formatDate(a.submittedAt ?? a.startedAt, intl)}
                  {a.late && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">{t.study.late}</span>}
                </span>
                {a.submittedAt ? (
                  <span className={`font-semibold tabular-nums ${scoreTone(a.percent)}`}>{Math.round(a.percent ?? 0)} %</span>
                ) : (
                  <span className="text-sm text-accent-text">{t.study.resumeArrow}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ErrorNote message={error} />
      {renderConfig(start)}
      <section>
        <SectionTitle>{historyTitle ?? t.study.history}</SectionTitle>
        {history.loading && !history.data ? (
          <ListSkeleton />
        ) : history.error ? (
          <ErrorNote message={history.error} onRetry={history.reload} />
        ) : quizzes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            {t.study.historyEmpty}
          </p>
        ) : (
          <ul className="space-y-2">
            {quizzes.map((q, i) => (
              <li
                key={q.id}
                className="rise-in flex items-stretch gap-2"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <button
                  type="button"
                  onClick={() => openQuiz(q.id)}
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-line-strong hover:shadow-card"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{q.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t.study.questionsCount(q.questionCount)} · {formatDate(q.createdAt, intl)} ·{" "}
                      {t.study.attemptsCount(q.attemptCount)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-semibold tabular-nums ${scoreTone(q.lastPercent)}`}>
                      {q.lastPercent === null ? "—" : `${Math.round(q.lastPercent)} %`}
                    </span>
                    {q.bestPercent !== null && q.attemptCount > 1 && (
                      <span className="block text-xs text-muted">{t.study.best(Math.round(q.bestPercent))}</span>
                    )}
                  </span>
                </button>
                {q.inProgress && (
                  <button
                    type="button"
                    onClick={() => resume(q.id, q.inProgress!.id)}
                    className="btn btn-secondary shrink-0 self-center"
                    title={t.study.startedOn(formatDate(q.inProgress.startedAt, intl))}
                  >
                    {t.study.resume}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

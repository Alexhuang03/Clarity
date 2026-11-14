"use client";

import { useState } from "react";
import type { Difficulty, QuestionType, StatsResponse, StudyScope } from "@/lib/study/types";
import { QuizWorkspace } from "./quiz-workspace";
import { Chip, Field, ScopePicker, Segmented, ToolIntro, type ScopeOptions } from "./ui";
import { useStudyResource } from "./use-study";
import { useT } from "@/lib/i18n/client";

type QuizType = Exclude<QuestionType, "open">;

const DIFFICULTIES: (Difficulty | "mixte")[] = ["mixte", "facile", "moyen", "difficile"];
const TYPES: QuizType[] = ["single", "multiple", "truefalse", "short"];

function ConfigCard({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="card rise-in">
      <div className="space-y-6 p-6">{children}</div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Quiz

export function QuizTool({ courseId, scopeOptions }: { courseId: string; scopeOptions: ScopeOptions }) {
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixte">("mixte");
  const [types, setTypes] = useState<QuizType[]>(["single", "multiple", "truefalse", "short"]);
  const [scope, setScope] = useState<StudyScope>({});
  const { t } = useT();
  const difficulties = DIFFICULTIES.map((value) => ({ value, label: t.study.difficulty[value] }));

  return (
    <>
      <ToolIntro title={t.study.tools.quiz.label}>{t.study.quiz.intro}</ToolIntro>
      <QuizWorkspace
        courseId={courseId}
        mode="quiz"
        historyTitle={t.study.quiz.history}
        renderConfig={(start) => (
          <ConfigCard
            footer={
              <>
                {types.length === 0 && <span className="text-sm text-danger">{t.study.quiz.pickType}</span>}
                <button
                  type="button"
                  disabled={types.length === 0}
                  onClick={() => start({ mode: "quiz", count, difficulty, types, scope })}
                  className="btn btn-primary"
                >
                  {t.study.quiz.generate}
                </button>
              </>
            }
          >
            <Field label={t.study.countLabel}>
              <Segmented
                label={t.study.countLabel}
                value={count}
                onChange={setCount}
                options={[5, 10, 15, 20, 30].map((n) => ({ value: n, label: String(n) }))}
              />
            </Field>
            <Field label={t.study.difficultyLabel}>
              <Segmented label={t.study.difficultyLabel} value={difficulty} onChange={setDifficulty} options={difficulties} />
            </Field>
            <Field label={t.study.quiz.typesLabel}>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((type) => (
                  <Chip
                    key={type}
                    checked={types.includes(type)}
                    onChange={(on) => setTypes((list) => (on ? [...list, type] : list.filter((x) => x !== type)))}
                  >
                    {t.study.quiz.types[type]}
                  </Chip>
                ))}
              </div>
            </Field>
            <ScopePicker options={scopeOptions} value={scope} onChange={setScope} />
          </ConfigCard>
        )}
      />
    </>
  );
}

// ------------------------------------------------------------------ Examen blanc

export function ExamTool({ courseId, scopeOptions }: { courseId: string; scopeOptions: ScopeOptions }) {
  const [duration, setDuration] = useState(60);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixte">("mixte");
  const [scope, setScope] = useState<StudyScope>({});
  const { t } = useT();
  const difficulties = DIFFICULTIES.map((value) => ({ value, label: t.study.difficulty[value] }));

  return (
    <>
      <ToolIntro title={t.study.tools.examen.label}>{t.study.exam.intro}</ToolIntro>
      <QuizWorkspace
        courseId={courseId}
        mode="exam"
        historyTitle={t.study.exam.history}
        generatingHint={t.study.exam.generatingHint}
        renderConfig={(start) => (
          <ConfigCard
            footer={
              <>
                <span className="mr-auto text-sm text-muted">{t.study.exam.timerNote}</span>
                <button
                  type="button"
                  onClick={() => start({ mode: "exam", durationMinutes: duration, count, difficulty, scope })}
                  className="btn btn-primary"
                >
                  {t.study.exam.start}
                </button>
              </>
            }
          >
            <Field label={t.study.exam.duration}>
              <Segmented
                label={t.study.exam.duration}
                value={duration}
                onChange={setDuration}
                options={[15, 30, 60, 90, 120, 180].map((m) => ({ value: m, label: t.study.exam.durationValue(m) }))}
              />
            </Field>
            <Field label={t.study.countLabel} hint={t.study.exam.countHint}>
              <Segmented
                label={t.study.countLabel}
                value={count}
                onChange={setCount}
                options={[6, 10, 15, 20].map((n) => ({ value: n, label: String(n) }))}
              />
            </Field>
            <Field label={t.study.difficultyLabel}>
              <Segmented label={t.study.difficultyLabel} value={difficulty} onChange={setDifficulty} options={difficulties} />
            </Field>
            <ScopePicker options={scopeOptions} value={scope} onChange={setScope} />
          </ConfigCard>
        )}
      />
    </>
  );
}

// ------------------------------------------------------------------ Test rapide

export function QuickTestTool({ courseId }: { courseId: string }) {
  const stats = useStudyResource<StatsResponse>(courseId, "/stats");
  const weak = stats.data?.weakConcepts ?? [];
  const { t } = useT();

  return (
    <>
      <ToolIntro title={t.study.tools["test-rapide"].label}>{t.study.quick.intro}</ToolIntro>
      <QuizWorkspace
        courseId={courseId}
        mode="quick"
        historyTitle={t.study.quick.history}
        generatingHint={t.study.quick.generatingHint}
        renderConfig={(start) => (
          <div className="card rise-in relative isolate overflow-hidden p-8 text-center">
            <div
              aria-hidden
              className="absolute left-1/2 top-0 -z-10 h-48 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent-text shadow-card">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
                <path strokeLinejoin="round" d="M13 2 4 14h7l-1 8 9-12h-7z" />
              </svg>
            </div>
            <p className="mt-4 text-sm text-muted">
              {weak.length > 0 ? t.study.quick.targeted : t.study.quick.general}
            </p>
            {weak.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {weak.map((c) => (
                  <span key={c.key} className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs text-danger">
                    {c.label} · {Math.round(c.mastery * 100)} %
                  </span>
                ))}
              </div>
            )}
            <button type="button" onClick={() => start({ mode: "quick", targetWeak: true })} className="btn btn-primary mt-6 px-6 py-2.5">
              {t.study.quick.start}
            </button>
          </div>
        )}
      />
    </>
  );
}

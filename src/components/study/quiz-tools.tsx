"use client";

import { useState } from "react";
import type { Difficulty, QuestionType, StatsResponse, StudyScope } from "@/lib/study/types";
import { QuizWorkspace } from "./quiz-workspace";
import { Chip, Field, ScopePicker, Segmented, ToolIntro, type ScopeOptions } from "./ui";
import { useStudyResource } from "./use-study";

type QuizType = Exclude<QuestionType, "open">;

const DIFFICULTIES: { value: Difficulty | "mixte"; label: string }[] = [
  { value: "mixte", label: "Mixte" },
  { value: "facile", label: "Facile" },
  { value: "moyen", label: "Moyen" },
  { value: "difficile", label: "Difficile" },
];

const TYPES: { value: QuizType; label: string }[] = [
  { value: "single", label: "QCM" },
  { value: "multiple", label: "Choix multiples" },
  { value: "truefalse", label: "Vrai / faux" },
  { value: "short", label: "Réponse courte" },
];

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

  return (
    <>
      <ToolIntro title="Quiz">Des questions corrigées et expliquées, avec les sources du cours.</ToolIntro>
      <QuizWorkspace
        courseId={courseId}
        mode="quiz"
        historyTitle="Mes quiz"
        renderConfig={(start) => (
          <ConfigCard
            footer={
              <>
                {types.length === 0 && <span className="text-sm text-danger">Choisis au moins un type de question.</span>}
                <button
                  type="button"
                  disabled={types.length === 0}
                  onClick={() => start({ mode: "quiz", count, difficulty, types, scope })}
                  className="btn btn-primary"
                >
                  Générer le quiz
                </button>
              </>
            }
          >
            <Field label="Nombre de questions">
              <Segmented
                label="Nombre de questions"
                value={count}
                onChange={setCount}
                options={[5, 10, 15, 20, 30].map((n) => ({ value: n, label: String(n) }))}
              />
            </Field>
            <Field label="Difficulté">
              <Segmented label="Difficulté" value={difficulty} onChange={setDifficulty} options={DIFFICULTIES} />
            </Field>
            <Field label="Types de questions">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    checked={types.includes(t.value)}
                    onChange={(on) => setTypes((list) => (on ? [...list, t.value] : list.filter((x) => x !== t.value)))}
                  >
                    {t.label}
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

  return (
    <>
      <ToolIntro title="Examen blanc">
        Un sujet complet en temps limité, avec des questions ouvertes notées selon un barème. À la fin du temps, ta
        copie est remise automatiquement.
      </ToolIntro>
      <QuizWorkspace
        courseId={courseId}
        mode="exam"
        historyTitle="Mes examens blancs"
        generatingHint="Clarity rédige ton sujet et son barème à partir du cours. Le chrono ne démarre qu'une fois le sujet prêt."
        renderConfig={(start) => (
          <ConfigCard
            footer={
              <>
                <span className="mr-auto text-sm text-muted">Le chrono démarre dès que le sujet est prêt.</span>
                <button
                  type="button"
                  onClick={() => start({ mode: "exam", durationMinutes: duration, count, difficulty, scope })}
                  className="btn btn-primary"
                >
                  Lancer l&apos;examen
                </button>
              </>
            }
          >
            <Field label="Durée">
              <Segmented
                label="Durée"
                value={duration}
                onChange={setDuration}
                options={[15, 30, 60, 90, 120, 180].map((m) => ({
                  value: m,
                  label: m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`,
                }))}
              />
            </Field>
            <Field label="Nombre de questions" hint="dont environ un tiers de questions ouvertes">
              <Segmented
                label="Nombre de questions"
                value={count}
                onChange={setCount}
                options={[6, 10, 15, 20].map((n) => ({ value: n, label: String(n) }))}
              />
            </Field>
            <Field label="Difficulté">
              <Segmented label="Difficulté" value={difficulty} onChange={setDifficulty} options={DIFFICULTIES} />
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

  return (
    <>
      <ToolIntro title="Test rapide">
        Cinq questions, deux minutes, résultat immédiat. Clarity cible en priorité les notions où tu as le plus de mal.
      </ToolIntro>
      <QuizWorkspace
        courseId={courseId}
        mode="quick"
        historyTitle="Derniers tests"
        generatingHint="Cinq questions sur tes notions fragiles arrivent : quelques secondes."
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
              {weak.length > 0 ? "Notions ciblées en priorité :" : "Pas encore de notion fragile repérée : test général sur tout le cours."}
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
              Lancer le test · 5 questions
            </button>
          </div>
        )}
      />
    </>
  );
}

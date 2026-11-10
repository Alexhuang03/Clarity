"use client";

import Link from "next/link";
import CountUp from "@/components/reactbits/CountUp";
import type { ConceptMastery, StatsResponse } from "@/lib/study/types";
import { formatDate } from "./api";
import { ErrorNote, SectionTitle, scoreTone } from "./ui";
import { useStudyResource } from "./use-study";

const MODE_LABEL = { quiz: "Quiz", exam: "Examen blanc", quick: "Test rapide" } as const;
const MODE_PATH = { quiz: "quiz", exam: "examen", quick: "test-rapide" } as const;

function Tile({ value, suffix, label, href }: { value: number | null; suffix?: string; label: string; href?: string }) {
  const body = (
    <>
      <span className="block text-3xl font-semibold tabular-nums tracking-tight">
        {value === null ? "—" : <CountUp to={value} duration={1.1} trigger="load" suffix={suffix} />}
      </span>
      <span className="mt-1 block text-xs text-muted">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-pop">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

function MasteryBar({ concept }: { concept: ConceptMastery }) {
  const pct = Math.round(concept.mastery * 100);
  const color = concept.level === "maitrise" ? "bg-success" : concept.level === "moyen" ? "bg-amber-500" : "bg-danger";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{concept.label}</span>
        <span className="shrink-0 tabular-nums text-muted">{pct} %</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

/** Progression du cours : chiffres clés, notions fragiles, dernières tentatives. */
export function StudyStats({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useStudyResource<StatsResponse>(courseId, "/stats");
  const base = `/courses/${courseId}/study`;

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        ))}
      </div>
    );
  }

  const { totals, weakConcepts, recentAttempts, concepts } = data;
  const empty = totals.quizzesTaken === 0 && totals.cardsTotal === 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile value={totals.streakDays} label={totals.streakDays > 1 ? "jours d'affilée" : "jour d'affilée"} />
        <Tile value={totals.cardsDue} label="cartes à réviser" href={`${base}/flashcards`} />
        <Tile value={totals.quizzesTaken} label="quiz remis" />
        <Tile
          value={totals.averagePercent === null ? null : Math.round(totals.averagePercent)}
          suffix=" %"
          label="score moyen"
        />
      </div>

      {empty ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          Fais un premier quiz ou révise quelques flashcards : ta progression par notion apparaîtra ici.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionTitle>Notions à retravailler</SectionTitle>
              {weakConcepts.length > 0 && (
                <Link href={`${base}/test-rapide`} className="-mt-3 text-xs font-medium text-accent-text hover:underline">
                  Test rapide ciblé →
                </Link>
              )}
            </div>
            {weakConcepts.length === 0 ? (
              <p className="text-sm text-muted">Aucune notion fragile repérée. Continue comme ça !</p>
            ) : (
              <ul className="space-y-3">
                {weakConcepts.map((c) => (
                  <MasteryBar key={c.key} concept={c} />
                ))}
              </ul>
            )}
            {concepts.length > weakConcepts.length && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-muted hover:text-foreground">
                  Toutes les notions ({concepts.length})
                </summary>
                <ul className="mt-3 space-y-3">
                  {concepts.map((c) => (
                    <MasteryBar key={c.key} concept={c} />
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="card p-5">
            <SectionTitle>Dernières tentatives</SectionTitle>
            {recentAttempts.length === 0 ? (
              <p className="text-sm text-muted">Aucun quiz remis pour l&apos;instant.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {recentAttempts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`${base}/${MODE_PATH[a.mode]}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.title}</span>
                        <span className="block text-xs text-muted">
                          {MODE_LABEL[a.mode]} · {formatDate(a.submittedAt ?? a.startedAt)}
                        </span>
                      </span>
                      <span className={`font-semibold tabular-nums ${scoreTone(a.percent)}`}>
                        {a.percent === null ? "—" : `${Math.round(a.percent)} %`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">{totals.reviewsLast7Days} révisions de cartes ces 7 derniers jours.</p>
          </section>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import CountUp from "@/components/reactbits/CountUp";
import type { AnswerValue, AttemptResult, Question, QuestionResult } from "@/lib/study/types";
import { Md, Sources, scoreTone } from "./ui";

const LETTERS = "ABCDEFGHIJ";

const STATUS: Record<QuestionResult["status"], { label: string; icon: string; tone: string }> = {
  correct: { label: "Juste", icon: "✓", tone: "bg-green-500/12 text-success" },
  partial: { label: "Partiel", icon: "≈", tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  incorrect: { label: "Faux", icon: "✕", tone: "bg-red-500/10 text-danger" },
  unanswered: { label: "Sans réponse", icon: "–", tone: "bg-surface-2 text-muted" },
};

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function Choices({ question, given }: { question: Question & { choices: string[] }; given: AnswerValue }) {
  const correct = question.type === "single" ? [question.answer] : question.type === "multiple" ? question.answers : [];
  const picked = Array.isArray(given) ? given : typeof given === "number" ? [given] : [];
  return (
    <ul className="space-y-1.5">
      {question.choices.map((choice, i) => {
        const isCorrect = correct.includes(i);
        const isPicked = picked.includes(i);
        return (
          <li
            key={i}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
              isCorrect
                ? "border-green-500/40 bg-green-500/[0.07]"
                : isPicked
                  ? "border-red-500/40 bg-red-500/[0.06]"
                  : "border-transparent"
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                isCorrect ? "bg-success text-white" : isPicked ? "bg-danger text-white" : "border border-line-strong text-muted"
              }`}
            >
              {LETTERS[i]}
            </span>
            <Md text={choice} className="flex-1" />
            <span className="sr-only">
              {isCorrect ? "bonne réponse" : ""}
              {isPicked ? " ta réponse" : ""}
            </span>
            {isPicked && <span className="shrink-0 text-xs text-muted">ta réponse</span>}
          </li>
        );
      })}
    </ul>
  );
}

function GivenText({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function ResultItem({ question, result, index }: { question: Question; result: QuestionResult; index: number }) {
  const [open, setOpen] = useState(result.status !== "correct");
  const status = STATUS[result.status];
  return (
    <li className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-surface-2/60"
      >
        <span
          aria-label={status.label}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${status.tone}`}
        >
          {status.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-muted">
            Question {index + 1} · {question.concept}
          </span>
          <Md text={question.prompt} className={open ? "" : "line-clamp-2"} />
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted">
          {fmt(result.score)}/{fmt(result.maxScore)}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4">
          {(question.type === "single" || question.type === "multiple") && (
            <Choices question={question} given={result.given} />
          )}
          {question.type === "truefalse" && (
            <p className="text-sm">
              Ta réponse :{" "}
              <strong>{result.given === true ? "Vrai" : result.given === false ? "Faux" : "aucune"}</strong> · Bonne
              réponse : <strong className="text-success">{question.answer ? "Vrai" : "Faux"}</strong>
            </p>
          )}
          {(question.type === "short" || question.type === "open") && (
            <>
              <GivenText label="Ta réponse" text={typeof result.given === "string" && result.given.trim() ? result.given : "—"} />
              <div className="rounded-lg border border-green-500/30 bg-green-500/[0.05] px-3 py-2">
                <p className="mb-1 text-xs font-medium text-success">Réponse attendue</p>
                <Md text={question.expected} />
              </div>
            </>
          )}
          {result.rubricScores && result.rubricScores.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Barème</p>
              <ul className="space-y-2">
                {result.rubricScores.map((r, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex justify-between gap-3">
                      <span>{r.criterion}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {fmt(r.points)}/{fmt(r.maxPoints)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${r.maxPoints ? (r.points / r.maxPoints) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.feedback && (
            <div className="rounded-lg bg-accent-soft px-3 py-2">
              <p className="mb-1 text-xs font-medium text-accent-text">Retour du correcteur</p>
              <Md text={result.feedback} />
            </div>
          )}
          {question.explanation && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Explication</p>
              <Md text={question.explanation} sources={question.sources} />
            </div>
          )}
          <Sources sources={question.sources} />
        </div>
      )}
    </li>
  );
}

/** Correction d'une tentative : note, appréciation, détail question par question. */
export function QuizResults({
  result,
  title,
  actions,
}: {
  result: AttemptResult;
  title: string;
  actions?: React.ReactNode;
}) {
  const counts = result.results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const byId = new Map(result.questions.map((q) => [q.id, q]));
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card rise-in relative isolate overflow-hidden p-6 text-center sm:p-8">
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -z-10 h-40 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
        />
        <p className="eyebrow">{title}</p>
        <p className={`mt-3 text-6xl font-semibold tabular-nums tracking-tight ${scoreTone(result.percent)}`}>
          <CountUp to={Math.round(result.percent)} duration={1.1} trigger="load" />
          <span className="text-3xl">%</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {fmt(result.score)} / {fmt(result.maxScore)} points
          {result.late && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">remis en retard</span>}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
          {(["correct", "partial", "incorrect", "unanswered"] as const).map((s) =>
            counts[s] ? (
              <span key={s} className={`rounded-full px-2.5 py-1 ${STATUS[s].tone}`}>
                {counts[s]} {STATUS[s].label.toLowerCase()}
              </span>
            ) : null,
          )}
        </div>
        {result.feedback && (
          <div className="mx-auto mt-6 max-w-lg text-left">
            <Md text={result.feedback} />
          </div>
        )}
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>

      <ol className="mt-6 space-y-3">
        {result.results.map((r, i) => {
          const q = byId.get(r.questionId);
          return q ? <ResultItem key={r.questionId} question={q} result={r} index={i} /> : null;
        })}
      </ol>
    </div>
  );
}

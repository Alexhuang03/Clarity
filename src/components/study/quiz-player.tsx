"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnswerValue,
  Answers,
  AttemptResponse,
  AttemptResult,
  AttemptSummary,
  PublicQuestion,
  PublicQuiz,
} from "@/lib/study/types";
import { errorMessage, studyApi } from "./api";
import { ProgressStepper } from "./progress-stepper";
import { ErrorNote, Generating, Md } from "./ui";

const LETTERS = "ABCDEFGHIJ";

const isAnswered = (value: AnswerValue | undefined) =>
  value !== undefined &&
  value !== null &&
  !(typeof value === "string" && value.trim() === "") &&
  !(Array.isArray(value) && value.length === 0);

const storageKey = (attemptId: string) => `clarity-answers-${attemptId}`;

/**
 * Réponses gardées dans le navigateur (un rechargement ne fait rien perdre), sinon le brouillon
 * enregistré sur le serveur (reprise depuis un autre appareil).
 */
function loadAnswers(attemptId: string, fallback: Answers): Answers {
  if (typeof window === "undefined") return fallback;
  try {
    const local = JSON.parse(localStorage.getItem(storageKey(attemptId)) ?? "{}") as Answers;
    return Object.keys(local).length > 0 ? local : fallback;
  } catch {
    return fallback;
  }
}

// Délai avant d'enregistrer le brouillon sur le serveur après une modification
const DRAFT_DELAY_MS = 1500;

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Compte à rebours jusqu'à deadlineAt ; onExpire appelé une seule fois à zéro. */
function Countdown({ deadlineAt, onExpire }: { deadlineAt: string; onExpire: () => void }) {
  const deadline = new Date(deadlineAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const expired = useRef(false);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline && !expired.current) {
        expired.current = true;
        expire.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  const remaining = (deadline - now) / 1000;
  const urgent = remaining <= 60;
  const warning = remaining <= 300;
  return (
    <div
      role="timer"
      aria-live={urgent ? "assertive" : "off"}
      aria-label={`Temps restant ${formatClock(remaining)}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-sm tabular-nums transition-colors ${
        urgent
          ? "animate-pulse border-red-500/40 bg-red-500/10 text-danger motion-reduce:animate-none"
          : warning
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-line bg-surface"
      }`}
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
        <circle cx="10" cy="11" r="6.5" />
        <path strokeLinecap="round" d="M10 8v3l2 1.5M8 2.5h4" />
      </svg>
      {formatClock(remaining)}
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: PublicQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  if (question.type === "single" || question.type === "multiple") {
    const multiple = question.type === "multiple";
    const selected = multiple ? ((value as number[] | undefined) ?? []) : value;
    return (
      <div role={multiple ? "group" : "radiogroup"} className="space-y-2">
        {multiple && <p className="text-xs text-muted">Plusieurs réponses possibles.</p>}
        {question.choices.map((choice, i) => {
          const checked = multiple ? (selected as number[]).includes(i) : selected === i;
          return (
            <button
              key={i}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={checked}
              onClick={() =>
                onChange(
                  multiple
                    ? checked
                      ? (selected as number[]).filter((x) => x !== i)
                      : [...(selected as number[]), i].sort((a, b) => a - b)
                    : i,
                )
              }
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                checked
                  ? "border-accent/60 bg-accent-soft"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-xs font-semibold transition ${
                  multiple ? "rounded-md" : "rounded-full"
                } ${checked ? "bg-accent text-accent-foreground" : "border border-line-strong text-muted"}`}
              >
                {LETTERS[i]}
              </span>
              <Md text={choice} className="flex-1 pt-0.5" />
            </button>
          );
        })}
      </div>
    );
  }
  if (question.type === "truefalse") {
    return (
      <div role="radiogroup" className="grid grid-cols-2 gap-3">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded-xl border px-4 py-4 font-medium transition ${
              value === v ? "border-accent/60 bg-accent-soft text-accent-text" : "border-line bg-surface hover:bg-surface-2"
            }`}
          >
            {v ? "Vrai" : "Faux"}
          </button>
        ))}
      </div>
    );
  }
  const open = question.type === "open";
  return (
    <div>
      <textarea
        value={(value as string | undefined) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={6000}
        rows={open ? 8 : 2}
        placeholder={open ? "Rédige ta réponse : structure, justifie, illustre…" : "Ta réponse en quelques mots"}
        aria-label="Ta réponse"
        className="field resize-y leading-relaxed"
      />
      {open && (
        <p className="mt-1.5 text-right text-xs tabular-nums text-muted">
          {((value as string | undefined) ?? "").length} / 6000
        </p>
      )}
    </div>
  );
}

/**
 * Déroulé d'une tentative : une question à la fois, barre de progression, navigation libre,
 * puis remise. Examen blanc (deadlineAt) : chrono visible et remise automatique à zéro.
 */
export function QuizPlayer({
  courseId,
  quiz,
  attempt,
  initialAnswers = {},
  onGraded,
  onQuit,
}: {
  courseId: string;
  quiz: PublicQuiz;
  attempt: AttemptSummary;
  /** Brouillon enregistré sur le serveur (GET de la tentative) */
  initialAnswers?: Answers;
  onGraded: (result: AttemptResult) => void;
  onQuit: () => void;
}) {
  const questions = quiz.questions;
  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(attempt.id, initialAnswers));
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const reduce = useReducedMotion();
  const answersRef = useRef(answers);
  // Remise automatique (fin du chrono) : une seule fois, même si elle échoue (sinon relance en boucle)
  const autoSubmitted = useRef(false);
  const savedDraft = useRef(JSON.stringify(answers));
  useEffect(() => {
    answersRef.current = answers;
    const json = JSON.stringify(answers);
    try {
      localStorage.setItem(storageKey(attempt.id), json);
    } catch {
      // Stockage indisponible : les réponses restent en mémoire
    }
    if (json === savedDraft.current) return;
    // Brouillon sur le serveur, regroupé : reprise possible depuis un autre appareil
    const timer = setTimeout(() => {
      studyApi(courseId, `/quizzes/${quiz.id}/attempts/${attempt.id}`, { method: "PATCH", body: { answers } }).then(
        () => {
          savedDraft.current = json;
        },
        () => {
          // Sans gravité : les réponses restent dans le navigateur et seront envoyées à la remise
        },
      );
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [answers, attempt.id, courseId, quiz.id]);

  const needsAi = questions.some((q) => q.type === "short" || q.type === "open");
  const question = questions[index];
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    setConfirm(false);
    try {
      const res = await studyApi<AttemptResponse>(courseId, `/quizzes/${quiz.id}/attempts/${attempt.id}`, {
        method: "POST",
        body: { answers: answersRef.current },
      });
      if (res.status === "submitted") {
        try {
          localStorage.removeItem(storageKey(attempt.id));
        } catch {}
        onGraded(res.attempt);
        return;
      }
      setError("La correction n'est pas encore disponible. Réessaie.");
    } catch (e) {
      setError(errorMessage(e));
    }
    setSubmitting(false);
  }, [courseId, quiz.id, attempt.id, onGraded]);

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.max(0, Math.min(questions.length - 1, next)));
  };

  if (submitting) {
    return (
      <Generating
        label={needsAi ? "Correction en cours…" : "Correction…"}
        hint={
          timeUp
            ? "Temps écoulé : ta copie a été remise automatiquement. Clarity la corrige."
            : needsAi
              ? "Les réponses rédigées sont corrigées par l'IA selon le barème : cela peut prendre jusqu'à une minute."
              : "Un instant…"
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={onQuit} className="btn btn-ghost -ml-3 px-3 py-1.5 font-normal">
          ← Quitter
        </button>
        {attempt.deadlineAt && (
          <Countdown
            deadlineAt={attempt.deadlineAt}
            onExpire={() => {
              if (autoSubmitted.current) return;
              autoSubmitted.current = true;
              setTimeUp(true);
              void submit();
            }}
          />
        )}
      </div>

      <ProgressStepper
        count={questions.length}
        current={index}
        answered={(i) => isAnswered(answers[questions[i].id])}
        onSelect={go}
      />

      <div className="relative mt-8 min-h-64">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={question.id}
            custom={direction}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-surface-2 px-2 py-0.5">{question.concept}</span>
              <span>
                {question.points} point{question.points > 1 ? "s" : ""}
              </span>
              {question.type === "open" && <span>· question ouverte</span>}
            </div>
            <Md text={question.prompt} className="mb-6 text-[1.05rem] font-medium [&_.prose]:text-[1.05rem]" />
            <QuestionInput
              question={question}
              value={answers[question.id]}
              onChange={(value) => setAnswers((a) => ({ ...a, [question.id]: value }))}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6">
        <ErrorNote message={error} onRetry={error ? () => void submit() : undefined} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-6">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="btn btn-ghost">
          ← Précédente
        </button>
        {index < questions.length - 1 ? (
          <button type="button" onClick={() => go(index + 1)} className="btn btn-primary">
            Suivante →
          </button>
        ) : confirm ? (
          <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="text-muted">
              {questions.length - answeredCount} sans réponse. Remettre quand même ?
            </span>
            <button type="button" onClick={() => void submit()} className="btn btn-primary">
              Remettre
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="btn btn-ghost">
              Continuer
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (answeredCount < questions.length ? setConfirm(true) : void submit())}
            className="btn btn-primary"
          >
            Remettre ma copie
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { TEACH_GOAL_MAX, TEACH_LEVEL_MAX, TEACH_TOPIC_MAX } from "@/lib/teach/types";
import ShinyText from "@/components/reactbits/ShinyText";
import { Spotlight } from "@/components/ui/spotlight";

const TOPIC_MIN = 3;
/** Valeur interne du choix « Autre » (niveau libre) */
const OTHER = "__other__";

const sparkle = (
  <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 2.5 11.6 8 17 9.6l-5.4 1.6L10 16.7l-1.6-5.5L3 9.6 8.4 8 10 2.5ZM16 14.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z"
    />
  </svg>
);

/**
 * Mode professeur : l'utilisateur tape un sujet (et, s'il le veut, son niveau et son objectif),
 * le serveur crée le cours et lance sa rédaction sourcée sur le web, puis on ouvre la page du cours
 * qui affiche la progression comme pour un fichier importé.
 */
export function TeachForm() {
  const { t } = useT();
  const router = useRouter();
  const id = useId();
  const topicRef = useRef<HTMLInputElement>(null);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [otherLevel, setOtherLevel] = useState("");
  const [goal, setGoal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levelValue = (level === OTHER ? otherLevel : level).trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const subject = topic.trim();
    if (subject.length < TOPIC_MIN) {
      setError(t.teach.topicTooShort(TOPIC_MIN));
      topicRef.current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    let response: Response;
    try {
      response = await fetch("/api/teach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: subject.slice(0, TEACH_TOPIC_MAX),
          ...(levelValue && { level: levelValue.slice(0, TEACH_LEVEL_MAX) }),
          ...(goal.trim() && { goal: goal.trim().slice(0, TEACH_GOAL_MAX) }),
        }),
      });
    } catch {
      setPending(false);
      return setError(t.teach.errorNetwork);
    }
    const data = (await response.json().catch(() => null)) as { courseId?: unknown; error?: unknown } | null;
    const courseId = typeof data?.courseId === "string" ? data.courseId : "";
    // Identifiant attendu : un UUID (jamais d'adresse arbitraire passée à router.push)
    if (response.ok && /^[0-9a-f-]{8,64}$/i.test(courseId)) {
      // On reste en « Préparation… » jusqu'à l'ouverture du cours
      router.push(`/courses/${courseId}`, { transitionTypes: ["nav-forward"] });
      return;
    }
    setPending(false);
    const serverError = typeof data?.error === "string" ? data.error : null;
    setError(
      serverError ||
        (response.status === 429
          ? t.teach.errorQuota
          : response.status === 401
            ? t.teach.errorAuth
            : response.status === 400
              ? t.teach.errorInvalid
              : t.teach.errorServer),
    );
  }

  function pickExample(example: string) {
    setTopic(example);
    setError(null);
    topicRef.current?.focus();
  }

  return (
    <Spotlight aria-labelledby={`${id}-title`} className="rise-in relative mb-10 overflow-hidden p-5 sm:p-7 shadow-card">
      {/* Halo décoratif, discret, dans le coin */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent-soft blur-3xl"
      />
      <div className="relative">
        <p className="eyebrow flex items-center gap-1.5">
          {sparkle}
          <ShinyText text={t.teach.eyebrow} speed={3} className="text-xs font-semibold uppercase tracking-wider text-accent-text" />
        </p>
        <h2 id={`${id}-title`} className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
          {t.teach.title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{t.teach.intro}</p>

        <form onSubmit={submit} className="mt-5" noValidate>
          <label htmlFor={`${id}-topic`} className="mb-2 block text-sm font-medium">
            {t.teach.topicLabel}
          </label>
          {/* Barre de recherche : champ et bouton côte à côte, empilés sur petit écran */}
          <div className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 shadow-card transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft sm:flex-row sm:items-center">
            <input
              ref={topicRef}
              id={`${id}-topic`}
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                if (error) setError(null);
              }}
              maxLength={TEACH_TOPIC_MAX}
              placeholder={t.teach.topicPlaceholder}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              autoComplete="off"
              enterKeyHint="go"
              disabled={pending}
              className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted placeholder:opacity-70 disabled:opacity-60"
            />
            <button type="submit" disabled={pending} className="btn btn-primary min-h-11 shrink-0 rounded-xl px-5">
              {pending ? (
                <>
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                  />
                  {t.teach.submitting}
                </>
              ) : (
                <>
                  {sparkle}
                  {t.teach.submit}
                </>
              )}
            </button>
          </div>

          {error && (
            <p id={`${id}-error`} role="alert" className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {/* Sujets d'exemple : un clic remplit le champ */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs text-muted">{t.teach.examplesLabel}</span>
            {t.teach.examples.map((example) => (
              <button
                key={example}
                type="button"
                disabled={pending}
                onClick={() => pickExample(example)}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent-text disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>

          {/* Options repliables : niveau et objectif */}
          <details className="group mt-4 border-t border-line pt-3">
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground [&::-webkit-details-marker]:hidden">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-4 w-4 transition-transform group-open:rotate-90"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8 5 5 5-5 5" />
              </svg>
              {t.teach.options}
              <span className="font-normal opacity-70">· {t.teach.optionsHint}</span>
              {levelValue && (
                <span className="truncate rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">
                  {levelValue}
                </span>
              )}
            </summary>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2" disabled={pending}>
                <legend className="mb-2 text-sm text-muted">{t.teach.levelLabel}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {[...t.teach.levels, OTHER].map((value) => {
                    const selected = level === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setLevel(selected ? "" : value)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-line bg-surface hover:border-accent/50 hover:bg-accent-soft hover:text-accent-text"
                        }`}
                      >
                        {value === OTHER ? t.teach.levelOther : value}
                      </button>
                    );
                  })}
                </div>
                {level === OTHER && (
                  <label className="block">
                    <span className="sr-only">{t.teach.levelOtherLabel}</span>
                    <input
                      value={otherLevel}
                      onChange={(e) => setOtherLevel(e.target.value)}
                      maxLength={TEACH_LEVEL_MAX}
                      autoFocus
                      placeholder={t.teach.levelPlaceholder}
                      className="field"
                    />
                  </label>
                )}
              </fieldset>

              <label className="block space-y-1.5">
                <span className="text-sm text-muted">{t.teach.goalLabel}</span>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={TEACH_GOAL_MAX}
                  rows={2}
                  disabled={pending}
                  placeholder={t.teach.goalPlaceholder}
                  className="field resize-none"
                />
              </label>
            </div>
          </details>

          <p className="mt-3 text-xs text-muted opacity-80">{t.teach.disclaimer}</p>
        </form>
      </div>
    </Spotlight>
  );
}

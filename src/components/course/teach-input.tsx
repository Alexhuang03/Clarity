"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DocumentRow } from "@/lib/course/types";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { TEACH_GOAL_MAX, TEACH_LEVEL_MAX, TEACH_TOPIC_MAX } from "@/lib/teach/types";
import { AddDocumentsButton, UploadChips, type DocKind, type Upload } from "./documents";

const TOPIC_MIN = 3;
/** Valeur interne du choix « Autre » (niveau libre) */
const OTHER = "__other__";

export const sparkleIcon = (
  <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4 shrink-0">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 2.5 11.6 8 17 9.6l-5.4 1.6L10 16.7l-1.6-5.5L3 9.6 8.4 8 10 2.5ZM16 14.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z"
    />
  </svg>
);

/** Message d'erreur de POST /api/teach, selon le statut (et le code éventuel) de la réponse */
function teachError(status: number, code: unknown, t: Dictionary) {
  if (status === 429) return t.teach.errorQuota;
  if (status === 401) return t.teach.errorAuth;
  if (status === 404) return t.teach.errorNotFound;
  if (status === 409) return code === "not_empty" ? t.teach.errorNotEmpty : t.teach.errorBusy;
  if (status === 503) return t.teach.errorUnavailable;
  if (status === 400) return t.teach.errorInvalid;
  return t.teach.errorServer;
}

/**
 * Barre d'un cours vide : mode professeur. Le sujet tapé (avec niveau et objectif facultatifs) part à
 * POST /api/teach pour ce cours ; le serveur crée le document du cours et le rédige en arrière-plan.
 * Le bouton + reste là pour importer des documents à la place.
 */
export function TeachInput({
  courseId,
  onStarted,
  onStale,
  onFiles,
  onLink,
  uploads,
  documents,
  onDismissUpload,
}: {
  courseId: string;
  /** Rédaction lancée (202) : la page recharge le cours pour suivre la progression */
  onStarted: () => void;
  /** Le cours n'est plus vide (document ajouté entre-temps) : la page recharge ses documents */
  onStale: (message: string) => void;
  onFiles: (files: File[], kind: DocKind) => void;
  onLink: (url: string, kind: DocKind) => Promise<boolean>;
  uploads: Upload[];
  documents: DocumentRow[];
  onDismissUpload: (id: string) => void;
}) {
  const { t, locale } = useT();
  const id = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [level, setLevel] = useState("");
  const [otherLevel, setOtherLevel] = useState("");
  const [goal, setGoal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});

  const levelValue = (level === OTHER ? otherLevel : level).trim();
  const suggestionKey = `${locale}|${levelValue.toLowerCase()}`;
  const currentSuggestions = suggestions[suggestionKey];

  // Recommandations selon le cours et le niveau. Le délai évite un appel par lettre d'un niveau libre.
  useEffect(() => {
    if (currentSuggestions) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let items: string[] = [];
      try {
        const response = await fetch(`/api/courses/${courseId}/teach-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(levelValue ? { level: levelValue.slice(0, TEACH_LEVEL_MAX) } : {}),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as { suggestions?: unknown } | null;
        if (response.ok && Array.isArray(data?.suggestions)) {
          items = data.suggestions.filter((s): s is string => typeof s === "string");
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) setSuggestions((current) => ({ ...current, [suggestionKey]: items }));
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [courseId, currentSuggestions, levelValue, suggestionKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const subject = topic.trim();
    // Un lien seul collé dans la barre : c'est un document à importer, comme dans le chat
    if (/^https?:\/\/\S+$/i.test(subject)) {
      setTopic("");
      if (!(await onLink(subject, "cours"))) setTopic(subject);
      return;
    }
    if (subject.length < TOPIC_MIN) {
      setError(t.teach.topicTooShort(TOPIC_MIN));
      inputRef.current?.focus();
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
          courseId,
        }),
      });
    } catch {
      setPending(false);
      return setError(t.teach.errorNetwork);
    }
    if (response.status === 202 || response.ok) {
      // La page prend le relais (progression du document) : la barre reste en attente jusque-là
      onStarted();
      return;
    }
    const data = (await response.json().catch(() => null)) as { code?: unknown } | null;
    setPending(false);
    const message = teachError(response.status, data?.code, t);
    if (response.status === 409 && data?.code === "not_empty") return onStale(message);
    setError(message);
  }

  function pickSuggestion(suggestion: string) {
    setTopic(suggestion);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-background from-55% to-transparent px-4 pb-4 pt-10">
      <UploadChips uploads={uploads} documents={documents} onDismiss={onDismissUpload} />
      <div className="mx-auto max-w-[40rem]">
        {error && (
          <p id={`${id}-error`} role="alert" className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Options repliables, juste au-dessus de la barre : niveau et objectif */}
        {optionsOpen && (
          <div id={`${id}-options`} className="card rise-in mb-2 grid gap-4 p-4 sm:grid-cols-2">
            <fieldset disabled={pending}>
              <legend className="mb-2 text-xs font-medium text-muted">{t.teach.levelLabel}</legend>
              <div className="flex flex-wrap gap-1.5">
                {[...t.teach.levels, OTHER].map((value) => {
                  const selected = level === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setLevel(selected ? "" : value)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
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
                <label className="mt-2 block">
                  <span className="sr-only">{t.teach.levelOtherLabel}</span>
                  <input
                    value={otherLevel}
                    onChange={(e) => setOtherLevel(e.target.value)}
                    maxLength={TEACH_LEVEL_MAX}
                    autoFocus
                    placeholder={t.teach.levelPlaceholder}
                    className="field py-1.5 text-sm"
                  />
                </label>
              )}
            </fieldset>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">{t.teach.goalLabel}</span>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={TEACH_GOAL_MAX}
                rows={2}
                disabled={pending}
                placeholder={t.teach.goalPlaceholder}
                className="field resize-none py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        <form
          onSubmit={submit}
          className="flex items-end gap-2 rounded-[1.6rem] border border-line bg-surface p-1.5 shadow-pop transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent-soft"
        >
          <AddDocumentsButton onFiles={onFiles} onLink={onLink} />
          <textarea
            ref={inputRef}
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={TEACH_TOPIC_MAX}
            disabled={pending}
            aria-label={t.teach.placeholder}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            placeholder={t.teach.placeholder}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 outline-none placeholder:opacity-50 disabled:opacity-60 [field-sizing:content]"
          />
          <button
            disabled={pending || !topic.trim()}
            aria-label={t.teach.send}
            title={t.teach.sendTitle}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted sm:px-4"
          >
            {pending ? (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
              />
            ) : (
              sparkleIcon
            )}
            <span className="hidden sm:inline">{t.teach.send}</span>
          </button>
        </form>

        {/* Recommandations selon le cours et le niveau (masquées s'il n'y en a pas) */}
        {currentSuggestions === undefined ? (
          <div aria-hidden className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-9 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none ${i > 1 ? "hidden sm:block" : ""}`}
              />
            ))}
          </div>
        ) : (
          currentSuggestions.length > 0 && (
            <div role="group" aria-label={t.teach.suggestionsLabel} className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {currentSuggestions.map((suggestion, i) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={pending}
                  title={suggestion}
                  onClick={() => pickSuggestion(suggestion)}
                  className={`min-h-9 rounded-xl border border-line bg-surface px-3 py-1.5 text-left text-xs leading-snug text-muted transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent-text disabled:opacity-50 ${
                    i > 1 ? "hidden sm:block" : ""
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )
        )}

        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <p className="flex min-w-0 items-center gap-1.5 text-muted opacity-70">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
            <span className="truncate">{t.teach.context}</span>
          </p>
          <button
            type="button"
            onClick={() => setOptionsOpen((o) => !o)}
            aria-expanded={optionsOpen}
            aria-controls={`${id}-options`}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            {levelValue ? <span className="max-w-24 truncate font-medium text-accent-text">{levelValue}</span> : t.teach.options}
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className={`h-3.5 w-3.5 transition-transform ${optionsOpen ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 5-5 5 5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** État d'un cours vide : importer des documents, ou taper un sujet pour que Clarity rédige le cours. */
export function TeachEmptyState() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-lg pt-6 sm:pt-10">
      <p className="text-center text-lg font-medium">{t.teach.emptyTitle}</p>
      <p className="mt-1 text-center text-sm text-muted">{t.teach.emptyIntro}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="card rise-in p-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-lg leading-none shadow-card">
            +
          </span>
          <p className="mt-3 font-medium">{t.teach.emptyUploadTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t.teach.emptyUploadText}</p>
        </div>
        <div className="card rise-in p-5 [animation-delay:80ms]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            {sparkleIcon}
          </span>
          <p className="mt-3 font-medium">{t.teach.emptyTeachTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t.teach.emptyTeachText}</p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted opacity-80">{t.teach.disclaimer}</p>
    </div>
  );
}

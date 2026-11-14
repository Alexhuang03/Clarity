"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "@/components/course/markdown";
import { readStream } from "@/lib/course/read-stream";
import { pingIconUrl, type PingDef } from "@/lib/annotations/lol";
import type { AnnotationRow, ThreadKind, ThreadMessage } from "@/lib/annotations/types";
import { extractVerdict, isPartialVerdict, verdictBadge, type Verdict } from "@/lib/annotations/verdict";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Réponse de l'IA en cours de génération pour une annotation. */
export type Pending = { text: string; running: boolean; userText?: string; error?: string };

/**
 * Fait répondre l'IA dans le fil d'une annotation (flux NDJSON de /api/annotations/[id]/reply).
 * La réponse arrive mot à mot dans `pending`, puis rejoint le fil de l'annotation une fois enregistrée.
 */
export function useThreadRunner(setAnnotations: React.Dispatch<React.SetStateAction<AnnotationRow[]>>) {
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const running = useRef(new Set<string>());
  const connectionLost = useT().t.course.connectionLost;

  /** content : message de l'étudiant (suite de la discussion). Renvoie false en cas d'échec. */
  const run = useCallback(
    async (id: string, content?: string): Promise<boolean> => {
      if (running.current.has(id) || id.startsWith("tmp-")) return false;
      running.current.add(id);
      const update = (change: (p: Pending) => Pending) =>
        setPending((all) => ({ ...all, [id]: change(all[id] ?? { text: "", running: true }) }));
      setPending((all) => ({ ...all, [id]: { text: "", running: true, userText: content } }));
      // Objet plutôt que variable : l'erreur est notée dans un rappel, hors du suivi de types de TypeScript
      const outcome: { error: string | null } = { error: null };
      try {
        const res = await fetch(`/api/annotations/${id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content ? { content } : {}),
        });
        await readStream(res, (event) => {
          if (event.type === "delta") update((p) => ({ ...p, text: p.text + event.text }));
          else if (event.type === "error") outcome.error = event.error;
          else if (event.type === "done") {
            const { row, verdict } = event.message as { row: ThreadMessage; verdict?: Verdict | null };
            setAnnotations((list) =>
              list.map((a) =>
                a.id === id
                  ? { ...a, thread_messages: [...(a.thread_messages ?? []), row], ...(verdict !== undefined ? { verdict } : {}) }
                  : a,
              ),
            );
            if (row.role === "user") update((p) => ({ ...p, userText: undefined }));
          }
        });
      } catch {
        outcome.error = connectionLost;
      } finally {
        running.current.delete(id);
      }
      if (outcome.error) {
        const error = outcome.error;
        update(() => ({ text: "", running: false, error }));
        return false;
      }
      setPending((all) => {
        const rest = { ...all };
        delete rest[id];
        return rest;
      });
      return true;
    },
    [setAnnotations, connectionLost],
  );

  return { pending, run };
}

/** Messages du fil, dans l'ordre. */
export const threadOf = (a: AnnotationRow) => [...(a.thread_messages ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at));

/** Le fil attend une réponse de l'IA (première réponse jamais arrivée, ou génération interrompue). */
export function awaitsAnswer(a: AnnotationRow) {
  const thread = threadOf(a);
  const last = thread[thread.length - 1];
  return a.kind === "question" ? last?.role === "user" : !last || last.role === "user";
}

/** Ce que l'étudiant a écrit en ouvrant le fil. */
export function openingText(a: AnnotationRow, t: Dictionary) {
  if (a.kind === "question") return threadOf(a)[0]?.content ?? "";
  return a.note ?? (a.kind === "error" ? t.annotations.flaggedWrong : "");
}

/** Texte brut court d'une réponse Markdown (aperçu d'une bulle repliée). */
const plain = (text: string) =>
  text
    .replace(/\[S\d+\]/g, "")
    // Formules : quelques symboles courants en clair, le reste du LaTeX retiré
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\(?:d?frac|sqrt|left|right|text|mathrm|[()[\]])/g, " ")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[*_#>`{}]|\$+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const TONES = {
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function VerdictBadge({ kind, verdict }: { kind: ThreadKind; verdict: Verdict | null | undefined }) {
  const { t } = useT();
  if (!verdict || kind === "question") return null;
  const badge = verdictBadge(kind, verdict);
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${TONES[badge.tone]}`}>
      {t.annotations.verdict[kind][verdict]}
    </span>
  );
}

function Thinking() {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs opacity-60">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
      {t.annotations.thinking}
    </span>
  );
}

function UserLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3 py-1.5 text-sm text-accent-foreground">{children}</p>
    </div>
  );
}

export type Actions = {
  onReply: (text: string) => Promise<boolean>;
  onRetry: () => void;
  onStatus: (status: AnnotationRow["status"]) => void;
  onDelete: () => void;
};

/** Fil complet : passage, ouverture, échanges avec l'IA, réponse en cours et champ pour poursuivre. */
export function ThreadView({
  annotation,
  ping,
  pending,
  actions,
  onClose,
}: {
  annotation: AnnotationRow;
  ping: PingDef;
  pending?: Pending;
  actions: Actions;
  onClose?: () => void;
}) {
  const kind = annotation.kind as ThreadKind;
  const thread = threadOf(annotation);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const running = !!pending?.running;
  const live = pending?.text ?? "";
  const shown = isPartialVerdict(live) ? { verdict: null, content: "" } : extractVerdict(live);
  const waiting = !running && awaitsAnswer(annotation);
  const temporary = annotation.id.startsWith("tmp-");
  const { t } = useT();

  // Suit la fin de la discussion pendant que la réponse s'écrit
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [live, thread.length, pending?.userText]);

  async function send() {
    const message = text.trim();
    if (!message || running) return;
    setText("");
    if (!(await actions.onReply(message))) setText(message);
  }

  const done = annotation.status !== "open";
  const statusButton =
    kind === "question"
      ? { label: done ? t.annotations.understoodDone : t.annotations.understood, next: done ? "open" : "understood" }
      : kind === "error"
        ? { label: done ? t.annotations.resolved : t.annotations.resolve, next: done ? "open" : "resolved" }
        : null;

  return (
    <div className="flex max-h-[min(70vh,34rem)] flex-col">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône du ping */}
        <img src={pingIconUrl(ping.icon)} alt="" className="h-5 w-5" />
        <span className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide" style={{ color: ping.color }}>
          {t.annotations.kind[kind]}
        </span>
        <VerdictBadge kind={kind} verdict={shown.verdict ?? annotation.verdict} />
        <span className="flex-1" />
        {onClose && (
          <button type="button" onClick={onClose} className="rounded px-1 text-sm opacity-50 hover:opacity-100" aria-label={t.common.close}>
            ✕
          </button>
        )}
      </div>

      <blockquote className="mt-2 line-clamp-3 border-l-2 pl-2 text-xs italic opacity-60" style={{ borderColor: ping.color }}>
        {annotation.anchor.quote}
      </blockquote>

      <div ref={list} className="-mx-1 mt-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1 pb-1">
        {kind !== "question" && <UserLine>{openingText(annotation, t)}</UserLine>}
        {thread.map((m) =>
          m.role === "user" ? (
            <UserLine key={m.id}>{m.content}</UserLine>
          ) : (
            <div key={m.id}>
              <Markdown content={extractVerdict(m.content).content} sources={m.sources ?? []} variant="bubble" />
            </div>
          ),
        )}
        {pending?.userText && <UserLine>{pending.userText}</UserLine>}
        {running && (shown.content ? <Markdown content={shown.content} variant="bubble" /> : <Thinking />)}
        {(waiting || pending?.error) && !temporary && (
          <div className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs">
            <p>{pending?.error ?? t.annotations.notAnswered}</p>
            {waiting && (
              <button type="button" onClick={actions.onRetry} className="mt-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                {pending?.error ? t.common.retry : t.annotations.askAnswer}
              </button>
            )}
          </div>
        )}
      </div>

      {!waiting && !temporary && (
        <form
          className="mt-2 flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={4000}
            disabled={running}
            placeholder={running ? t.annotations.answering : t.annotations.reply}
            aria-label={t.annotations.replyLabel}
            className="max-h-28 min-h-8 flex-1 resize-none rounded-lg border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none [field-sizing:content] focus:border-indigo-500 disabled:opacity-50 dark:border-white/20"
          />
          <button
            type="submit"
            disabled={running || !text.trim()}
            className="h-8 rounded-lg bg-indigo-600 px-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            aria-label={t.course.send}
          >
            ↑
          </button>
        </form>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/10 pt-2 dark:border-white/10">
        {statusButton ? (
          <button
            type="button"
            disabled={temporary}
            onClick={() => actions.onStatus(statusButton.next as AnnotationRow["status"])}
            className={`rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40 ${
              done ? "text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {statusButton.label}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={actions.onDelete}
          disabled={temporary}
          className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
        >
          {t.common.delete}
        </button>
      </div>
    </div>
  );
}

/** Bulle repliée dans la marge : ce que l'étudiant a écrit et le début de la réponse. */
export function BubblePreview({ annotation, ping, pending }: { annotation: AnnotationRow; ping: PingDef; pending?: Pending }) {
  const kind = annotation.kind as ThreadKind;
  const thread = threadOf(annotation);
  const answers = thread.filter((m) => m.role === "assistant");
  const lastAnswer = answers[answers.length - 1];
  const live = pending?.running ? (isPartialVerdict(pending.text) ? { verdict: null, content: "" } : extractVerdict(pending.text)) : null;
  const replies = thread.length + (kind === "question" ? 0 : 1);
  const { t } = useT();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône du ping */}
        <img src={pingIconUrl(ping.icon)} alt="" className="h-4 w-4" />
        <span className="truncate whitespace-nowrap text-[0.65rem] font-semibold uppercase tracking-wide" style={{ color: ping.color }}>
          {t.annotations.kind[kind]}
        </span>
        <VerdictBadge kind={kind} verdict={live?.verdict ?? annotation.verdict} />
        {replies > 2 && <span className="ml-auto text-[0.65rem] opacity-50">💬 {replies}</span>}
      </div>
      <p className="line-clamp-2 text-sm">{openingText(annotation, t)}</p>
      {live ? (
        live.content ? (
          <p className="line-clamp-2 text-xs opacity-70">
            {t.annotations.clarityPrefix} {plain(live.content)}
          </p>
        ) : (
          <Thinking />
        )
      ) : pending?.error ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">⚠ {pending.error}</p>
      ) : lastAnswer ? (
        <p className="line-clamp-2 text-xs opacity-70">
          {t.annotations.clarityPrefix} {plain(extractVerdict(lastAnswer.content).content)}
        </p>
      ) : awaitsAnswer(annotation) && !annotation.id.startsWith("tmp-") ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.annotations.noAnswerYet}</p>
      ) : null}
    </div>
  );
}

/**
 * Bulle dans la marge, à hauteur du passage. Repliée : un aperçu ; ouverte : le fil complet.
 * Sa position est calculée par la couche d'annotations (register), qui empile les bulles sans chevauchement.
 */
export function MarginBubble({
  annotation,
  ping,
  pending,
  active,
  register,
  onActivate,
  onClose,
  actions,
}: {
  annotation: AnnotationRow;
  ping: PingDef;
  pending?: Pending;
  active: boolean;
  register: (id: string, el: HTMLDivElement | null) => void;
  onActivate: () => void;
  onClose: () => void;
  actions: Actions;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Avant le placement par la couche (effets de mise en page : enfants d'abord, parent ensuite)
  useLayoutEffect(() => {
    register(annotation.id, ref.current);
    return () => register(annotation.id, null);
  }, [annotation.id, register]);
  const done = annotation.status !== "open";
  const { t } = useT();
  const label = t.annotations.kind[annotation.kind];

  return (
    <div
      ref={ref}
      data-bubble={annotation.id}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={active ? undefined : onActivate}
      onKeyDown={(e) => {
        if (!active && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate();
        }
      }}
      role={active ? "dialog" : "button"}
      tabIndex={active ? undefined : 0}
      aria-label={active ? label : t.annotations.open(label)}
      className={`absolute left-0 w-full rounded-xl border border-l-[3px] bg-[var(--background)] transition-[top,box-shadow] duration-200 ${
        active
          ? "z-20 border-black/15 p-3 shadow-xl dark:border-white/20"
          : `z-10 cursor-pointer border-black/10 p-2.5 shadow-sm hover:shadow-md dark:border-white/15 ${done ? "opacity-55 hover:opacity-100" : ""}`
      }`}
      style={{ visibility: "hidden", borderLeftColor: ping.color }}
    >
      {active ? (
        <ThreadView annotation={annotation} ping={ping} pending={pending} actions={actions} onClose={onClose} />
      ) : (
        <BubblePreview annotation={annotation} ping={ping} pending={pending} />
      )}
    </div>
  );
}

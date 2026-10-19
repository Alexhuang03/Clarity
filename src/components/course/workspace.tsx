"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readStream } from "@/lib/course/read-stream";
import type { CourseRow, DocumentRow, MessageRow, PartRow } from "@/lib/course/types";
import { analyzeCourse } from "@/app/courses/actions";
import { CourseOutline } from "./course-outline";
import { CourseHeader } from "@/app/courses/[id]/course-header";
import { CourseColumns } from "./layout";
import { OutlineButton } from "./outline-button";
import { DocumentsPanel } from "./documents-panel";
import { Markdown } from "./markdown";
import { ThinkingPanel } from "./thinking-panel";

type Streaming = { kind: "summary" | "chat"; partId?: string; content: string; thinking: string } | null;

/** En-tête d'un message de l'IA : distingue clairement qui parle, et le type de réponse. */
function AssistantHeader({ kind, partTitle }: { kind: "summary" | "chat"; partTitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
        C
      </span>
      <span className="text-sm font-semibold">Clarity</span>
      {kind === "summary" && (
        <span className="truncate rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          Résumé{partTitle ? ` · ${partTitle}` : ""}
        </span>
      )}
    </div>
  );
}

/**
 * Un message de la conversation. Mémorisé : il n'est réaffiché que si son contenu change,
 * pas à chaque touche tapée ni à chaque morceau de texte reçu pour un autre message.
 */
export const MessageItem = memo(function MessageItem({
  message,
  partTitle,
}: {
  message: MessageRow;
  partTitle?: string;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end pt-2">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 leading-relaxed text-white">
          {message.content}
        </p>
      </div>
    );
  }
  return (
    <article>
      <AssistantHeader kind={message.kind} partTitle={partTitle} />
      {message.thinking && <ThinkingPanel text={message.thinking} durationMs={message.thinking_ms} />}
      <Markdown
        content={message.content}
        sources={message.sources}
        variant={message.kind === "summary" ? "summary" : "chat"}
        messageId={message.id}
      />
    </article>
  );
});

/**
 * Barre de question. Elle garde son texte pour elle : taper ne réaffiche que la barre,
 * et pas toute la conversation (qui peut contenir de longs résumés avec des formules).
 * onSend renvoie false si l'envoi a échoué : la question est alors remise dans la barre.
 */
function ChatInput({
  disabled,
  busy,
  onSend,
  context,
}: {
  disabled: boolean;
  busy: boolean;
  onSend: (content: string) => Promise<boolean>;
  /** Étiquette sous la barre : ce que fait cette conversation */
  context: string;
}) {
  const [value, setValue] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = value.trim();
    if (!content || busy || disabled) return;
    setValue("");
    if (!(await onSend(content))) setValue(content);
  }

  return (
    // Fondu sous la barre : le texte qui défile ne se voit plus à travers
    <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-[var(--background)] from-55% to-transparent px-4 pb-4 pt-10">
      <form
        onSubmit={submit}
        className="mx-auto flex max-w-[40rem] items-end gap-2 rounded-[1.6rem] border border-black/10 bg-[var(--background)] p-1.5 pl-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition focus-within:border-indigo-500/50 dark:border-white/10 dark:bg-[#151515] dark:shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={disabled}
          placeholder={disabled ? "Ajoute un document pour poser des questions" : "Pose une question sur ton cours…"}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 outline-none placeholder:opacity-50 [field-sizing:content]"
        />
        <button
          disabled={busy || disabled || !value.trim()}
          aria-label="Envoyer"
          title="Envoyer (Entrée)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:bg-black/10 disabled:text-black/40 dark:disabled:bg-white/10 dark:disabled:text-white/40"
        >
          <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 16V4M5 9l5-5 5 5" />
          </svg>
        </button>
      </form>
      {/* Étiquette : à quoi sert cette conversation */}
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-xs opacity-50">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
        {context}
      </p>
    </div>
  );
}

export function Workspace({
  course,
  userId,
  initialDocuments,
  initialParts,
  initialMessages,
}: {
  course: CourseRow;
  userId: string;
  initialDocuments: DocumentRow[];
  initialParts: PartRow[];
  initialMessages: MessageRow[];
}) {
  const [supabase] = useState(createClient);
  const [documents, setDocuments] = useState(initialDocuments);
  const [parts, setParts] = useState(initialParts);
  const [messages, setMessages] = useState(initialMessages);
  const [analyzedAt, setAnalyzedAt] = useState(course.analyzed_at);
  const [streaming, setStreaming] = useState<Streaming>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ready = documents.filter((d) => d.status === "ready");
  const processing = documents.some((d) => d.status === "uploaded" || d.status === "parsing");
  const summarizedParts = new Set(messages.filter((m) => m.kind === "summary").map((m) => m.part_id));
  const pendingParts = parts.filter((p) => !summarizedParts.has(p.id));
  // Des documents prêts ont été ajoutés depuis la dernière analyse
  const outdated = !!analyzedAt && ready.some((d) => d.created_at > analyzedAt);
  const busy = !!streaming || analyzing;

  // Suivi du traitement des documents en arrière-plan
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, kind, mime_type, status, progress, page_count, error, created_at")
        .eq("course_id", course.id)
        .order("created_at");
      if (data) setDocuments(data as DocumentRow[]);
    }, 2500);
    return () => clearInterval(timer);
  }, [processing, course.id, supabase]);

  useEffect(() => {
    if (streaming) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [streaming]);

  async function generateSummary(part: PartRow) {
    setError(null);
    setStreaming({ kind: "summary", partId: part.id, content: "", thinking: "" });
    const response = await fetch(`/api/courses/${course.id}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partId: part.id }),
    });
    await readStream(response, (event) => {
      if (event.type === "delta") setStreaming((s) => s && { ...s, content: s.content + event.text });
      if (event.type === "thinking") setStreaming((s) => s && { ...s, thinking: s.thinking + event.text });
      if (event.type === "done") setMessages((m) => [...m, event.message as MessageRow]);
      if (event.type === "error") setError(event.error);
    });
    setStreaming(null);
  }

  async function analyze() {
    setError(null);
    setAnalyzing(true);
    const result = await analyzeCourse(course.id);
    setAnalyzing(false);
    if ("error" in result && result.error) return setError(result.error);
    const newParts = (result.parts ?? []) as PartRow[];
    setParts(newParts);
    setAnalyzedAt(new Date().toISOString());
    // Une seule partie : on lance directement le résumé
    if (newParts.length === 1) await generateSummary(newParts[0]);
  }

  async function ask(content: string): Promise<boolean> {
    let ok = true;
    setError(null);
    // Affichage immédiat de la question, remplacée par la version enregistrée à la réception
    const pendingId = `pending-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        id: pendingId,
        role: "user",
        kind: "chat",
        part_id: null,
        content,
        sources: [],
        created_at: new Date().toISOString(),
      },
    ]);
    setStreaming({ kind: "chat", content: "", thinking: "" });
    const response = await fetch(`/api/courses/${course.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await readStream(response, (event) => {
      if (event.type === "delta") setStreaming((s) => s && { ...s, content: s.content + event.text });
      if (event.type === "thinking") setStreaming((s) => s && { ...s, thinking: s.thinking + event.text });
      if (event.type === "done") {
        const message = event.message as MessageRow;
        setMessages((m) =>
          message.role === "user" ? m.map((x) => (x.id === pendingId ? message : x)) : [...m, message],
        );
      }
      if (event.type === "error") {
        setError(event.error);
        // La question n'a pas été enregistrée si le serveur a refusé : on la rend à l'utilisateur
        setMessages((m) => m.filter((x) => x.id !== pendingId));
        ok = false;
      }
    });
    setStreaming(null);
    return ok;
  }

  const partTitle = useCallback((id: string | null) => parts.find((p) => p.id === id)?.title, [parts]);

  return (
    <>
      <CourseHeader
        title={course.title}
        subject={course.subject?.name ?? null}
        outline={<OutlineButton messages={messages} parts={parts} />}
      />
      <CourseColumns aside={<CourseOutline messages={messages} parts={parts} />}>
        <DocumentsPanel
          courseId={course.id}
          userId={userId}
          documents={documents}
          onChange={setDocuments}
          defaultOpen={messages.length === 0}
        />

        <div className="flex-1 space-y-10 py-8">
          {documents.length === 0 && (
            <p className="text-center opacity-70">
              Commence par ajouter les fichiers de ton cours et tes exercices ci-dessus.
            </p>
          )}

          {ready.length > 0 && !analyzedAt && !processing && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
              <p className="font-medium">Tes documents sont prêts.</p>
              <p className="mt-1 text-sm opacity-70">
                Ajoute tous tes fichiers (cours et exercices) avant de lancer : le résumé s&apos;appuie sur
                l&apos;ensemble.
              </p>
              <button
                type="button"
                onClick={analyze}
                disabled={busy}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {analyzing ? "Analyse du cours…" : "Analyser et résumer le cours"}
              </button>
            </div>
          )}

          {processing && !analyzedAt && (
            <p className="text-center text-sm opacity-70">
              Lecture de tes documents par l&apos;IA… Tu peux continuer à en ajouter pendant ce temps.
            </p>
          )}

          {messages.map((message) => (
            <MessageItem key={message.id} message={message} partTitle={partTitle(message.part_id)} />
          ))}

          {streaming && (
            <article aria-live="polite">
              <AssistantHeader kind={streaming.kind} partTitle={partTitle(streaming.partId ?? null)} />
              {streaming.thinking && <ThinkingPanel text={streaming.thinking} live={!streaming.content} />}
              {streaming.content ? (
                <Markdown content={streaming.content} variant={streaming.kind === "summary" ? "summary" : "chat"} />
              ) : (
                !streaming.thinking && (
                  <p className="animate-pulse opacity-60">
                    {streaming.kind === "summary" ? "Préparation du résumé…" : "Réflexion…"}
                  </p>
                )
              )}
            </article>
          )}

          {pendingParts.length > 0 && !streaming && (
            <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
              <p className="font-medium">
                {summarizedParts.size === 0
                  ? `Ce cours est long : je l'ai découpé en ${parts.length} parties. Par laquelle veux-tu commencer ?`
                  : "Parties restantes :"}
              </p>
              <ul className="mt-3 space-y-2">
                {pendingParts.map((part) => (
                  <li key={part.id}>
                    <button
                      type="button"
                      onClick={() => generateSummary(part)}
                      disabled={busy}
                      className="w-full rounded-lg border border-black/10 px-4 py-2 text-left hover:border-indigo-500 hover:bg-indigo-500/5 disabled:opacity-50 dark:border-white/15"
                    >
                      <span className="mr-2 opacity-50">{part.ordinal + 1}.</span>
                      {part.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outdated && !busy && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm">
              <span>De nouveaux documents ont été ajoutés depuis l&apos;analyse.</span>
              <button
                type="button"
                onClick={analyze}
                className="font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                Relancer l&apos;analyse
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <ChatInput
          disabled={ready.length === 0}
          busy={busy}
          onSend={ask}
          context={`Questions sur ce cours · réponses tirées de ${ready.length > 1 ? `tes ${ready.length} documents` : "ton document"}`}
        />
      </CourseColumns>
    </>
  );
}

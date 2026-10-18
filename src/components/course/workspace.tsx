"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readStream } from "@/lib/course/read-stream";
import type { CourseRow, DocumentRow, MessageRow, PartRow } from "@/lib/course/types";
import { analyzeCourse } from "@/app/courses/actions";
import { DocumentsPanel } from "./documents-panel";
import { Markdown } from "./markdown";

type Streaming = { kind: "summary" | "chat"; partId?: string; content: string } | null;

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
  const [question, setQuestion] = useState("");
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
    setStreaming({ kind: "summary", partId: part.id, content: "" });
    const response = await fetch(`/api/courses/${course.id}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partId: part.id }),
    });
    await readStream(response, (event) => {
      if (event.type === "delta") setStreaming((s) => s && { ...s, content: s.content + event.text });
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

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const content = question.trim();
    if (!content || busy) return;
    setError(null);
    setQuestion("");
    // Affichage immédiat de la question, remplacée par la version enregistrée à la réception
    const pendingId = `pending-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: pendingId, role: "user", kind: "chat", part_id: null, content, sources: [], created_at: new Date().toISOString() },
    ]);
    setStreaming({ kind: "chat", content: "" });
    const response = await fetch(`/api/courses/${course.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await readStream(response, (event) => {
      if (event.type === "delta") setStreaming((s) => s && { ...s, content: s.content + event.text });
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
        setQuestion(content);
      }
    });
    setStreaming(null);
  }

  const partTitle = (id: string | null) => parts.find((p) => p.id === id)?.title;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4">
      <DocumentsPanel
        courseId={course.id}
        userId={userId}
        documents={documents}
        onChange={setDocuments}
        defaultOpen={messages.length === 0}
      />

      <div className="flex-1 space-y-8 py-8">
        {documents.length === 0 && (
          <p className="text-center opacity-70">
            Commence par ajouter les fichiers de ton cours et tes exercices ci-dessus.
          </p>
        )}

        {ready.length > 0 && !analyzedAt && !processing && (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
            <p className="font-medium">Tes documents sont prêts.</p>
            <p className="mt-1 text-sm opacity-70">
              Ajoute tous tes fichiers (cours et exercices) avant de lancer : le résumé s&apos;appuie sur l&apos;ensemble.
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

        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2 text-white">
                {message.content}
              </p>
            </div>
          ) : (
            <article key={message.id}>
              {message.kind === "summary" && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  Résumé{partTitle(message.part_id) ? ` · ${partTitle(message.part_id)}` : ""}
                </p>
              )}
              <Markdown content={message.content} sources={message.sources} />
            </article>
          ),
        )}

        {streaming && (
          <article aria-live="polite">
            {streaming.kind === "summary" && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                Résumé{partTitle(streaming.partId ?? null) ? ` · ${partTitle(streaming.partId ?? null)}` : ""}
              </p>
            )}
            {streaming.content ? (
              <Markdown content={streaming.content} />
            ) : (
              <p className="animate-pulse opacity-60">
                {streaming.kind === "summary" ? "Rédaction du résumé…" : "Réflexion…"}
              </p>
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
            <button type="button" onClick={analyze} className="font-medium text-amber-700 hover:underline dark:text-amber-400">
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

      <form
        onSubmit={ask}
        className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-black/10 bg-[var(--background)] p-2 shadow-lg dark:border-white/15"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={ready.length === 0}
          placeholder={ready.length === 0 ? "Ajoute un document pour poser des questions" : "Pose une question sur ton cours…"}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none [field-sizing:content]"
        />
        <button
          disabled={busy || !question.trim() || ready.length === 0}
          className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}

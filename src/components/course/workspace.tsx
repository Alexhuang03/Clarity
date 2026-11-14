"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readStream } from "@/lib/course/read-stream";
import type { CourseRow, DocumentRow, MessageRow, PartRow } from "@/lib/course/types";
import { analyzeCourse, deleteExchange, syncParts } from "@/app/courses/actions";
import { CourseOutline } from "./course-outline";
import { CourseHeader } from "@/app/courses/[id]/course-header";
import { CourseColumns } from "./layout";
import { OutlineButton } from "./outline-button";
import { AddDocumentsButton, DropOverlay, UploadChips, useDocumentUpload, type DocKind, type Upload } from "./documents";
import { Markdown } from "./markdown";
import { AnnotationLayer } from "@/components/annotations/annotation-layer";
import type { AnnotationRow } from "@/lib/annotations/types";
import type { LolPrefs } from "@/lib/annotations/prefs";
import { ThinkingPanel } from "./thinking-panel";
import { useT } from "@/lib/i18n/client";
import type { CourseWebSources } from "@/lib/teach/types";
import { WebSourcesContext, WebSourcesNotice, WebSourcesSection } from "./web-sources";
import { TeachEmptyState, TeachInput } from "./teach-input";
import { Generating } from "@/components/study/ui";

type Streaming = { kind: "summary" | "chat"; partId?: string; content: string; thinking: string } | null;

/** Retour à une question précédente : elle revient dans la barre, la suite est masquée jusqu'à l'envoi */
type Rewind = { message: MessageRow; later: number; annotations: number | null };

/** Messages de la discussion remplacés par un retour à `from` (les résumés du cours restent) */
const replacedBy = (from: MessageRow) => (m: MessageRow) => m.kind === "chat" && m.created_at >= from.created_at;

/**
 * Résumé rédigé par le mode professeur, dont les [1], [2] citent les sources web du cours.
 * Critère : résumé de l'IA enregistré sans aucune source de document. Le mode professeur enregistre
 * ses résumés avec sources = [] (ses citations sont les [n] web), alors qu'un résumé généré ensuite
 * par l'outil ordinaire cite les extraits du document en [S1], [S2] (sources non vides). Les réponses
 * du chat sont toujours exclues. (Les liens ne sont créés que dans un cours qui a des sources web.)
 */
const isWebSummary = (m: MessageRow) => m.role === "assistant" && m.kind === "summary" && !m.sources?.length;

/** En-tête d'un message de l'IA : distingue clairement qui parle, et le type de réponse. */
function AssistantHeader({ kind, partTitle }: { kind: "summary" | "chat"; partTitle?: string }) {
  const { t } = useT();
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground font-display text-[0.95rem] italic text-background">
        C
      </span>
      <span className="text-sm font-semibold">Clarity</span>
      {kind === "summary" && (
        <span className="truncate rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
          {t.course.summaryBadge(partTitle)}
        </span>
      )}
    </div>
  );
}

const actionButton =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-35 transition hover:bg-black/5 hover:!opacity-100 focus-visible:opacity-100 group-hover:opacity-70 disabled:cursor-wait dark:hover:bg-white/10";

/** À gauche d'une question : revenir à ce message (le modifier), ou le retirer avec sa réponse. */
function QuestionActions({
  message,
  onRewind,
  onDelete,
}: {
  message: MessageRow;
  onRewind: (message: MessageRow) => void;
  onDelete: (message: MessageRow) => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { t } = useT();

  if (confirm) {
    return (
      <div className="mt-1 flex shrink-0 items-center gap-1 text-sm" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setConfirm(false)}>
        <span className="opacity-70">{t.course.removeQuestionConfirm}</span>
        <button
          type="button"
          autoFocus
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            if (!(await onDelete(message))) {
              setDeleting(false);
              setConfirm(false);
            }
          }}
          className="rounded-lg bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-500 disabled:opacity-60"
        >
          {deleting ? "…" : t.common.remove}
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="rounded-lg px-2 py-1 opacity-70 hover:opacity-100">
          {t.common.keep}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1 flex shrink-0">
      <button
        type="button"
        onClick={() => setConfirm(true)}
        aria-label={t.course.removeMessage}
        title={t.course.removeMessageTitle}
        className={actionButton}
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6M8.5 9v4M11.5 9v4" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onRewind(message)}
        aria-label={t.course.rewindMessage}
        title={t.course.rewindMessageTitle}
        className={actionButton}
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 5.5 4 9l3.5 3.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h7.5a4.5 4.5 0 0 1 0 9H9" />
        </svg>
      </button>
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
  onRewind,
  onDelete,
}: {
  message: MessageRow;
  partTitle?: string;
  /** Flèche « revenir à ce message » sur les questions (absente sur une conversation partagée) */
  onRewind?: (message: MessageRow) => void;
  /** Corbeille : retire la question et sa réponse */
  onDelete?: (message: MessageRow) => Promise<boolean>;
}) {
  if (message.role === "user") {
    const saved = !message.id.startsWith("pending-");
    return (
      <div className="group flex items-start justify-end gap-1.5 pt-2">
        {onRewind && onDelete && saved && <QuestionActions message={message} onRewind={onRewind} onDelete={onDelete} />}
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 leading-relaxed text-accent-foreground">
          {message.content}
        </p>
      </div>
    );
  }
  return (
    <article>
      <AssistantHeader kind={message.kind} partTitle={partTitle} />
      {message.thinking && <ThinkingPanel text={message.thinking} durationMs={message.thinking_ms} />}
      {/* Zone annotable : son texte sert de référence aux surlignages et questions */}
      <div data-annotatable={message.id}>
        <Markdown
          content={message.content}
          sources={message.sources}
          variant={message.kind === "summary" ? "summary" : "chat"}
          messageId={message.id}
          webCitations={isWebSummary(message)}
        />
      </div>
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
  onFiles,
  onLink,
  uploads,
  documents,
  onDismissUpload,
  initialValue = "",
  rewind,
  onCancelRewind,
}: {
  disabled: boolean;
  busy: boolean;
  onSend: (content: string) => Promise<boolean>;
  /** Étiquette sous la barre : ce que fait cette conversation */
  context: string;
  /** Bouton + : ajout de documents */
  onFiles: (files: File[], kind: DocKind) => void;
  onLink: (url: string, kind: DocKind) => Promise<boolean>;
  uploads: Upload[];
  documents: DocumentRow[];
  onDismissUpload: (id: string) => void;
  /** Texte de départ (question reprise par un retour en arrière) */
  initialValue?: string;
  rewind: Rewind | null;
  onCancelRewind: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const { t } = useT();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = value.trim();
    // Un lien seul, collé dans la barre : c'est un cours à ajouter (même sans document encore)
    if (/^https?:\/\/\S+$/i.test(content)) {
      setValue("");
      if (!(await onLink(content, "cours"))) setValue(content);
      return;
    }
    if (!content || busy || disabled) return;
    setValue("");
    if (!(await onSend(content))) setValue(content);
  }

  return (
    // Fondu sous la barre : le texte qui défile ne se voit plus à travers
    <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-background from-55% to-transparent px-4 pb-4 pt-10">
      <UploadChips uploads={uploads} documents={documents} onDismiss={onDismissUpload} />
      {rewind && (
        <div
          role="status"
          className="mx-auto mb-2 flex max-w-[40rem] items-start gap-3 rounded-xl border border-accent/30 bg-surface px-3 py-2 text-sm shadow-card"
        >
          <span aria-hidden className="mt-0.5 text-indigo-600 dark:text-indigo-400">↶</span>
          <p className="min-w-0 flex-1">
            <span className="font-medium">{t.course.rewindTitle}</span>{" "}
            <span className="opacity-70">
              {t.course.rewindEdit} {t.course.rewindLater(rewind.later)}
              {rewind.annotations ? t.course.rewindAnnotations(rewind.annotations) : ""}
              {t.course.rewindSummaries}
            </span>
          </p>
          <button
            type="button"
            onClick={onCancelRewind}
            className="shrink-0 rounded-lg px-2 py-0.5 font-medium text-accent-text hover:bg-accent-soft"
          >
            {t.common.cancel}
          </button>
        </div>
      )}
      <form
        onSubmit={submit}
        className="mx-auto flex max-w-[40rem] items-end gap-2 rounded-[1.6rem] border border-line bg-surface p-1.5 shadow-pop transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent-soft"
      >
        <AddDocumentsButton onFiles={onFiles} onLink={onLink} />
        <textarea
          autoFocus={!!initialValue}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
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
          placeholder={disabled ? t.course.inputDisabled : t.course.inputPlaceholder}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 outline-none placeholder:opacity-50 [field-sizing:content]"
        />
        <button
          disabled={busy || disabled || !value.trim()}
          aria-label={t.course.send}
          title={t.course.sendTitle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted"
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
  initialAnnotations,
  lolPrefs,
  webSources = null,
}: {
  course: CourseRow;
  userId: string;
  initialDocuments: DocumentRow[];
  initialParts: PartRow[];
  initialMessages: MessageRow[];
  initialAnnotations: AnnotationRow[];
  lolPrefs: LolPrefs;
  /** Cours rédigé en mode professeur : ses sources web (null pour un cours importé) */
  webSources?: CourseWebSources | null;
}) {
  const [supabase] = useState(createClient);
  const { t } = useT();
  const [documents, setDocuments] = useState(initialDocuments);
  const [parts, setParts] = useState(initialParts);
  const [messages, setMessages] = useState(initialMessages);
  const [analyzedAt, setAnalyzedAt] = useState(course.analyzed_at);
  const [streaming, setStreaming] = useState<Streaming>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewind, setRewind] = useState<Rewind | null>(null);
  // Change à chaque retour en arrière ou annulation : la barre repart avec le bon texte
  const [draft, setDraft] = useState({ key: 0, text: "" });
  const bottomRef = useRef<HTMLDivElement>(null);
  const { uploads, upload, addFromLink, dismiss } = useDocumentUpload({ courseId: course.id, userId, onChange: setDocuments });


  const ready = documents.filter((d) => d.status === "ready");
  const processing = documents.some((d) => d.status === "uploaded" || d.status === "parsing");
  const summarizedParts = new Set(messages.filter((m) => m.kind === "summary").map((m) => m.part_id));
  const pendingParts = parts.filter((p) => !summarizedParts.has(p.id));
  const busy = !!streaming || analyzing;
  // Pendant un retour en arrière, la suite de la discussion est masquée (supprimée seulement à l'envoi)
  const shown = useMemo(() => (rewind ? messages.filter((m) => !replacedBy(rewind.message)(m)) : messages), [messages, rewind]);
  const shownIds = useMemo(() => new Set(shown.map((m) => m.id)), [shown]);

  const startRewind = useCallback(
    async (message: MessageRow) => {
      const later = messages.filter(replacedBy(message));
      setError(null);
      setRewind({ message, later: later.length, annotations: null });
      setDraft((d) => ({ key: d.key + 1, text: message.content }));
      // Annotations qui disparaîtront à l'envoi : prévenir avant
      const { count } = await supabase
        .from("annotations")
        .select("id", { count: "exact", head: true })
        .in("message_id", later.map((m) => m.id));
      setRewind((r) => (r?.message.id === message.id ? { ...r, annotations: count ?? 0 } : r));
    },
    [messages, supabase],
  );
  const removeExchange = useCallback(async (message: MessageRow) => {
    setError(null);
    const result = await deleteExchange(message.id).catch(() => ({ error: t.course.connectionLost, deleted: undefined }));
    if (!result.deleted) {
      setError(result.error ?? t.course.cantRemove);
      return false;
    }
    const gone = new Set(result.deleted);
    setMessages((m) => m.filter((x) => !gone.has(x.id)));
    return true;
  }, [t]);
  const cancelRewind = () => {
    setRewind(null);
    setDraft((d) => ({ key: d.key + 1, text: "" }));
  };

  // Cours déjà analysé : un document ajouté, supprimé ou changé de type met les parties à jour tout seul
  // (nouvelles parties à la suite, parties déjà résumées intactes). Appels mis en file : jamais deux à la fois.
  const syncing = useRef<Promise<void>>(Promise.resolve());
  const refreshParts = useCallback(() => {
    syncing.current = syncing.current.then(async () => {
      const result = await syncParts(course.id);
      if ("parts" in result && result.parts) setParts(result.parts as PartRow[]);
    });
  }, [course.id]);
  const readyKey = ready.map((d) => d.id).join(",");
  useEffect(() => {
    if (analyzedAt) refreshParts();
  }, [readyKey, analyzedAt, refreshParts]);

  const reloadDocuments = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select("id, filename, kind, mime_type, status, progress, page_count, error, source_url, created_at")
      .eq("course_id", course.id)
      .order("created_at");
    if (data) setDocuments(data as DocumentRow[]);
    return data?.length ?? 0;
  }, [course.id, supabase]);

  // Suivi du traitement des documents en arrière-plan
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(reloadDocuments, 2500);
    return () => clearInterval(timer);
  }, [processing, reloadDocuments]);

  // Mode professeur : cours rédigé par l'IA (lancé ici, ou déjà en cours au chargement de la page)
  const [teaching, setTeaching] = useState(false);
  const isWeb = course.origin === "web" || teaching;
  const router = useRouter();

  async function startedTeaching() {
    setError(null);
    setTeaching(true);
    // Le document du cours existe dès la réponse : sa progression s'affiche comme pour un fichier importé
    // (quelques essais : il peut apparaître juste après la réponse)
    for (let i = 0; i < 5 && (await reloadDocuments()) === 0; i++) await new Promise((r) => setTimeout(r, 1000));
    router.refresh();
  }

  // Fin de la rédaction : chapitres, résumés et date d'analyse ont été écrits par le serveur. On les relit,
  // puis on recharge les données serveur (titre définitif, sources web) sans toucher au reste de la page.
  const wasProcessing = useRef(processing);
  useEffect(() => {
    if (wasProcessing.current && !processing && isWeb) {
      void (async () => {
        const [{ data: newParts }, { data: newMessages }, { data: row }] = await Promise.all([
          supabase.from("course_parts").select("id, ordinal, title").eq("course_id", course.id).order("ordinal"),
          supabase
            .from("messages")
            .select("id, role, kind, part_id, content, sources, thinking, thinking_ms, created_at")
            .eq("course_id", course.id)
            .order("created_at"),
          supabase.from("courses").select("analyzed_at").eq("id", course.id).maybeSingle(),
        ]);
        if (newParts) setParts(newParts as PartRow[]);
        if (newMessages) setMessages(newMessages as MessageRow[]);
        if (row) setAnalyzedAt(row.analyzed_at);
        router.refresh();
      })();
    }
    wasProcessing.current = processing;
  }, [processing, isWeb, course.id, supabase, router]);
  const teachDocument = isWeb ? documents.find((d) => d.status === "uploaded" || d.status === "parsing") : undefined;

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
    // Retour en arrière : la suite disparaît tout de suite (rendue si le serveur refuse)
    const from = rewind;
    const replaced = from ? messages.filter(replacedBy(from.message)) : [];
    if (from) {
      setRewind(null);
      setMessages((m) => m.filter((x) => !replaced.includes(x)));
    }
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
      body: JSON.stringify({ content, rewindFrom: from?.message.id }),
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
        setMessages((m) => {
          const kept = m.filter((x) => x.id !== pendingId);
          return replaced.length ? [...kept, ...replaced].sort((a, b) => a.created_at.localeCompare(b.created_at)) : kept;
        });
        if (from) setRewind(from);
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
        courseId={course.id}
        title={course.title}
        subject={course.subject?.name ?? null}
        outline={<OutlineButton messages={shown} parts={parts} documents={documents} onDocumentsChange={setDocuments} onDocumentsSettled={refreshParts} />}
      />
      <DropOverlay onFiles={upload} />
      <CourseColumns aside={<CourseOutline messages={shown} parts={parts} documents={documents} onDocumentsChange={setDocuments} onDocumentsSettled={refreshParts} />}>

        <WebSourcesContext value={webSources?.sources ?? null}>
        <div className="flex-1 space-y-10 py-8">
          {/* Pendant la rédaction, « grounded » vaut encore false par défaut : pas de bandeau trompeur */}
          {webSources && !teachDocument && <WebSourcesNotice data={webSources} />}
          {/* Cours vide : importer des documents, ou taper un sujet (mode professeur) */}
          {documents.length === 0 && <TeachEmptyState />}

          {/* Mode professeur : rédaction en cours, suivie par la progression du document du cours */}
          {teachDocument && (
            <Generating label={t.teach.generatingTitle(teachDocument.progress ?? 0)} hint={t.teach.generatingHint} />
          )}

          {ready.length > 0 && !analyzedAt && !processing && (
            <div className="card rise-in p-6 text-center">
              <p className="font-medium">{t.course.readyTitle}</p>
              <p className="mt-1 text-sm text-muted">{t.course.readyText}</p>
              <button
                type="button"
                onClick={analyze}
                disabled={busy}
                className="btn btn-primary mt-4"
              >
                {analyzing ? t.course.analyzing : t.course.analyze}
              </button>
            </div>
          )}

          {processing && !analyzedAt && !teachDocument && (
            <p className="text-center text-sm opacity-70">
              {t.course.reading}
            </p>
          )}

          <AnnotationLayer initialAnnotations={initialAnnotations} version={shown.length} messageIds={shownIds} prefs={lolPrefs}>
            <div className="space-y-10">
              {shown.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  partTitle={partTitle(message.part_id)}
                  onRewind={busy || message.kind !== "chat" || message.role !== "user" ? undefined : startRewind}
                  onDelete={busy || message.kind !== "chat" || message.role !== "user" ? undefined : removeExchange}
                />
              ))}
            </div>
          </AnnotationLayer>

          {streaming && (
            <article aria-live="polite">
              <AssistantHeader kind={streaming.kind} partTitle={partTitle(streaming.partId ?? null)} />
              {streaming.thinking && <ThinkingPanel text={streaming.thinking} live={!streaming.content} />}
              {streaming.content ? (
                <Markdown content={streaming.content} variant={streaming.kind === "summary" ? "summary" : "chat"} />
              ) : (
                !streaming.thinking && (
                  <p className="animate-pulse opacity-60">
                    {streaming.kind === "summary" ? t.course.preparingSummary : t.course.thinking}
                  </p>
                )
              )}
            </article>
          )}

          {pendingParts.length > 0 && !streaming && (
            <div className="card p-5">
              <p className="font-medium">
                {summarizedParts.size === 0 ? t.course.partsIntro(parts.length) : t.course.notSummarized}
              </p>
              <ul className="mt-3 space-y-2">
                {pendingParts.map((part) => (
                  <li key={part.id}>
                    <button
                      type="button"
                      onClick={() => generateSummary(part)}
                      disabled={busy}
                      className="w-full rounded-xl border border-line px-4 py-2 text-left transition hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50"
                    >
                      <span className="mr-2 opacity-50">{part.ordinal + 1}.</span>
                      {part.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mode professeur : sources web du cours, en fin de cours */}
          {webSources && !streaming && <WebSourcesSection data={webSources} />}

          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
        </WebSourcesContext>

        {documents.length === 0 ? (
          // Cours vide : la barre devient le mode professeur (le bouton + permet toujours d'importer)
          <TeachInput
            courseId={course.id}
            onStarted={startedTeaching}
            onStale={(message) => {
              setError(message);
              void reloadDocuments();
            }}
            onFiles={upload}
            onLink={addFromLink}
            uploads={uploads}
            documents={documents}
            onDismissUpload={dismiss}
          />
        ) : (
        <ChatInput
          key={draft.key}
          initialValue={draft.text}
          rewind={rewind}
          onCancelRewind={cancelRewind}
          disabled={ready.length === 0}
          busy={busy}
          onSend={ask}
          context={t.course.chatContext(ready.length)}
          onFiles={upload}
          onLink={addFromLink}
          uploads={uploads}
          documents={documents}
          onDismissUpload={dismiss}
        />
        )}
      </CourseColumns>
    </>
  );
}

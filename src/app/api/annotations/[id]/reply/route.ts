import type { Anchor } from "@/lib/annotations/anchor";
import { isThreadKind, type ThreadKind } from "@/lib/annotations/types";
import { extractVerdict } from "@/lib/annotations/verdict";
import { modelChain } from "@/lib/ai/models";
import type { ChatMessage } from "@/lib/ai/providers";
import { loadCourseContext } from "@/lib/course/context";
import { bubblePrompt } from "@/lib/course/prompts";
import { searchCourse } from "@/lib/course/retrieve";
import { finalizeCitations, formatSources, numberSources, type Source, type SourceChunk } from "@/lib/course/sources";
import { ndjsonResponse, streamAnswer } from "@/lib/course/stream";
import { LLM_INPUT_LIMITS } from "@/lib/security/llm";
import { enforceRateLimits, RATE_LIMITS, rateLimitResponse } from "@/lib/security/rate-limit";
import { cleanText, isUuid, jsonError, readJsonBody, requireUser } from "@/lib/security/request";

const MESSAGE_MAX = LLM_INPUT_LIMITS.note;
// Un fil reste une petite discussion : au-delà, mieux vaut poser la question dans le chat
const THREAD_MAX = 20;
// Groq gratuit : 8 000 tokens par minute. Une bulle reste petite (contexte et extraits limités).
const CONTEXT_CHARS = 1500;
const MAX_SOURCES = 4;
const MAX_CITED = 3;

type Row = {
  id: string;
  kind: string;
  anchor: Anchor;
  note: string | null;
  verdict: string | null;
  message: { id: string; course_id: string; content: string; sources: Source[] } | null;
  thread_messages: { role: "user" | "assistant"; content: string; created_at: string }[];
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Le passage dans le Markdown de la réponse (le texte sélectionné est le texte affiché :
 * on cherche donc des fragments de la citation), et les numéros [S#] cités juste autour.
 */
function locate(content: string, quote: string) {
  const text = squash(content);
  const q = squash(quote);
  let at = text.indexOf(q);
  // Formules et mise en forme diffèrent entre Markdown et texte affiché : on essaie des morceaux de la citation
  for (let i = 0; at === -1 && i < q.length - 20; i += 15) at = text.indexOf(q.slice(i, i + 25));
  if (at === -1) return { context: text.slice(0, CONTEXT_CHARS * 2), cited: [] as number[] };
  const from = Math.max(0, at - CONTEXT_CHARS);
  const to = Math.min(text.length, at + q.length + CONTEXT_CHARS);
  const near = text.slice(Math.max(0, at - 300), at + q.length + 300);
  const cited = [...new Set([...near.matchAll(/\[S(\d+)\]/g)].map((m) => Number(m[1])))];
  return { context: `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`, cited };
}

const OPENING: Record<ThreadKind, (note: string) => string> = {
  question: (note) => note,
  understanding: (note) => `Voici ce que j'ai compris de ce passage :\n\n${note}`,
  error: (note) => (note ? `Je pense que ce passage est faux : ${note}` : "Je pense que ce passage est faux. Peux-tu le revérifier ?"),
};

/**
 * Réponse de l'IA dans une bulle de marge (question, « ce que j'ai compris », erreur signalée).
 * Corps : { content } pour poursuivre la discussion ; vide pour la première réponse (ou la réessayer).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/annotations/[id]/reply">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Annotation introuvable.", 404);
  const body = await readJsonBody<{ content: unknown }>(request);
  if (body instanceof Response) return body;
  const followUp = cleanText(body.content, MESSAGE_MAX);

  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;

  const { data } = await supabase
    .from("annotations")
    .select("id, kind, anchor, note, verdict, message:messages(id, course_id, content, sources), thread_messages(role, content, created_at)")
    .eq("id", id)
    .maybeSingle();
  const annotation = data as unknown as Row | null;
  if (!annotation?.message || !isThreadKind(annotation.kind as never)) {
    return Response.json({ error: "Annotation introuvable." }, { status: 404 });
  }
  const kind = annotation.kind as ThreadKind;
  const thread = [...annotation.thread_messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = thread[thread.length - 1];

  if (!followUp) {
    // Première réponse (ou nouvel essai) : seulement si la dernière prise de parole n'a pas encore de réponse
    const waiting = kind === "question" ? last?.role === "user" : !last || last.role === "user";
    if (!waiting) return Response.json({ error: "Clarity a déjà répondu." }, { status: 409 });
  } else if (last?.role !== "assistant" && kind === "question") {
    return Response.json({ error: "Attends la réponse de Clarity avant de continuer." }, { status: 409 });
  }
  if (thread.length >= THREAD_MAX) {
    return Response.json({ error: "Cette discussion est longue : continue-la dans le chat, en bas de la page." }, { status: 409 });
  }

  const course = await loadCourseContext(supabase, annotation.message.course_id);
  if (!course) return Response.json({ error: "Cours introuvable." }, { status: 404 });

  const limited = await enforceRateLimits(user.id, RATE_LIMITS.annotationReply);
  if (!limited.ok) return rateLimitResponse(limited);

  let userRow: unknown = null;
  if (followUp) {
    const { data: inserted, error } = await supabase
      .from("thread_messages")
      .insert({ annotation_id: annotation.id, role: "user", content: followUp })
      .select("id, role, content, sources, created_at")
      .single();
    if (error) return Response.json({ error: "Message non enregistré." }, { status: 500 });
    userRow = inserted;
  }

  return ndjsonResponse(async (send) => {
    if (userRow) send({ type: "done", message: { row: userRow } });

    // Extraits : d'abord ceux que la réponse citait autour du passage, puis ceux que la recherche trouve
    const { quote } = annotation.anchor;
    const { context, cited } = locate(annotation.message!.content, quote);
    const citedIds = (annotation.message!.sources ?? [])
      .filter((s) => cited.includes(s.n))
      .slice(0, MAX_CITED)
      .map((s) => s.chunkId);
    const studentText = followUp || (kind === "question" ? (thread[0]?.content ?? "") : (annotation.note ?? ""));
    const [{ data: citedChunks }, found] = await Promise.all([
      citedIds.length
        ? supabase.from("chunks").select("id, document_id, page, section, content").in("id", citedIds)
        : Promise.resolve({ data: [] as SourceChunk[] }),
      searchCourse(supabase, course.course.id, `${studentText}\n\n${quote}`.slice(0, 2000), MAX_SOURCES).catch(() => []),
    ]);
    const chunks: SourceChunk[] = [];
    for (const c of [...(citedChunks ?? []), ...found]) {
      if (chunks.length < MAX_SOURCES + 1 && !chunks.some((x) => x.id === c.id)) chunks.push(c as SourceChunk);
    }
    const sources = numberSources(chunks, course.documents);

    // La discussion : l'ouverture (question, reformulation ou signalement), puis les échanges
    const opening = kind === "question" ? null : OPENING[kind](annotation.note ?? "");
    const messages: ChatMessage[] = [
      ...(opening ? [{ role: "user" as const, content: opening }] : []),
      ...thread.map((m) => ({ role: m.role, content: m.content })),
      ...(followUp ? [{ role: "user" as const, content: followUp }] : []),
    ];

    const answer = await streamAnswer(
      modelChain("chat", course.chatModel),
      {
        system: bubblePrompt(kind, course.level, { quote, context, sources: formatSources(sources, chunks) }, course.locale),
        messages,
        maxTokens: 1500,
      },
      send,
    );

    const { verdict, content } = extractVerdict(answer.content);
    const final = finalizeCitations(content.trim(), sources);
    if (!final.content) throw new Error("Réponse vide");
    const { data: row, error } = await supabase
      .from("thread_messages")
      .insert({ annotation_id: annotation.id, role: "assistant", content: final.content, sources: final.sources, model: answer.model })
      .select("id, role, content, sources, created_at")
      .single();
    if (error) throw error;
    if (verdict && kind !== "question") {
      await supabase.from("annotations").update({ verdict }).eq("id", annotation.id);
    }
    send({ type: "done", message: { row, verdict: kind === "question" ? null : (verdict ?? annotation.verdict) } });
  });
}

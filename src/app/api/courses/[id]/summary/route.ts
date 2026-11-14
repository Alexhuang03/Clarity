import { embed } from "@/lib/ai/gemini";
import { modelChain } from "@/lib/ai/models";
import { loadCourseContext } from "@/lib/course/context";
import { finalizeCitations, type SourceChunk } from "@/lib/course/sources";
import { ndjsonResponse } from "@/lib/course/stream";
import { generateSummary, planSummaryCalls } from "@/lib/course/summarize";
import { isSummaryDetail } from "@/lib/course/summarize-config";
import { enforceRateLimits, RATE_LIMITS, rateLimitResponse } from "@/lib/security/rate-limit";
import { isUuid, jsonError, readJsonBody, requireUser } from "@/lib/security/request";

// Au-delà, on ne garde que les extraits d'exercices les plus proches de la partie
const EXERCISES_FULL_MAX = 15_000;
// Cours d'une partie envoyé au plus (une partie normale en fait 30 000 à 45 000) et nombre de morceaux lus
const COURSE_CHARS_MAX = 80_000;
const MAX_PART_CHUNKS = 400;

// Résumé en plusieurs morceaux (niveau « détaillé » ou « très détaillé ») : plusieurs appels à l'IA à la suite
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  if (!isUuid(courseId)) return jsonError("Cours introuvable", 404);
  const body = await readJsonBody<{ partId: unknown; detail: unknown }>(request);
  if (body instanceof Response) return body;
  const { partId, detail } = body;
  if (!isUuid(partId)) return jsonError("Partie introuvable", 404);

  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;

  const ctx = await loadCourseContext(supabase, courseId);
  if (!ctx) return jsonError("Cours introuvable", 404);

  const { data: part } = await supabase
    .from("course_parts")
    .select("id, title, chunk_ids")
    .eq("id", partId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!part) return jsonError("Partie introuvable", 404);

  // Un résumé existe déjà pour cette partie : on ne le régénère pas (il est figé)
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("part_id", part.id)
    .eq("kind", "summary")
    .limit(1);
  if (existing?.length) return jsonError("Résumé déjà généré", 409);

  // course_parts.chunk_ids est modifiable par l'utilisateur via l'API : nombre d'ids et volume de cours bornés
  const chunkIds = (Array.isArray(part.chunk_ids) ? (part.chunk_ids as string[]) : []).filter(isUuid).slice(0, MAX_PART_CHUNKS);
  const { data: partChunks } = await supabase
    .from("chunks")
    .select("id, document_id, page, section, content, ordinal")
    .in("id", chunkIds);
  const order = new Map<string, number>(chunkIds.map((id, i) => [id, i]));
  const coursChunks: SourceChunk[] = [];
  let coursSize = 0;
  for (const chunk of (partChunks ?? []).sort((a, b) => order.get(a.id)! - order.get(b.id)!)) {
    if (coursSize + chunk.content.length > COURSE_CHARS_MAX && coursChunks.length) break;
    coursChunks.push(chunk);
    coursSize += chunk.content.length;
  }
  if (coursChunks.length === 0) {
    return jsonError("Le contenu de cette partie a été supprimé. Relance l'analyse.", 409);
  }

  // Compté seulement quand un résumé va vraiment être généré, une fois par appel à l'IA prévu
  // (un résumé détaillé = plusieurs morceaux + une synthèse)
  const summaryDetail = isSummaryDetail(detail) ? detail : ctx.summaryDetail;
  const calls = planSummaryCalls(coursChunks, summaryDetail);
  for (let i = 0; i < calls; i++) {
    const limited = await enforceRateLimits(user.id, RATE_LIMITS.summary);
    if (!limited.ok) return rateLimitResponse(limited);
  }

  // Exercices : tous s'ils sont courts, sinon les plus proches du sujet de la partie
  const exoIds = ctx.documents.filter((d) => d.kind === "exo").map((d) => d.id);
  let exoChunks: SourceChunk[] = [];
  if (exoIds.length) {
    const { data: allExo } = await supabase
      .from("chunks")
      .select("id, document_id, page, section, content, ordinal")
      .in("document_id", exoIds)
      .order("ordinal");
    const exoSize = (allExo ?? []).reduce((n, c) => n + c.content.length, 0);
    if (exoSize <= EXERCISES_FULL_MAX) {
      exoChunks = allExo ?? [];
    } else {
      const topics = [part.title, ...new Set(coursChunks.map((c) => c.section).filter(Boolean))].join(", ");
      const [query] = await embed([topics], "RETRIEVAL_QUERY");
      const { data: matches } = await supabase.rpc("match_chunks", {
        p_course_id: courseId,
        p_query_embedding: JSON.stringify(query),
        p_match_count: 10,
        p_document_ids: exoIds,
      });
      exoChunks = matches ?? [];
    }
  }

  return ndjsonResponse(async (send) => {
    // Niveau de détail : celui demandé (facultatif), sinon le réglage de l'utilisateur (« détaillé » par défaut)
    const { content, sources, thinking, thinkingMs, model } = await generateSummary(
      {
        courseTitle: ctx.course.title,
        partTitle: String(part.title),
        coursChunks,
        exoChunks,
        documents: ctx.documents,
        level: ctx.level,
        locale: ctx.locale,
        detail: summaryDetail,
        chain: modelChain("summary", ctx.summaryModel),
      },
      send,
    );

    const final = finalizeCitations(content, sources);
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        course_id: courseId,
        part_id: part.id,
        role: "assistant",
        kind: "summary",
        content: final.content,
        sources: final.sources,
        model,
        thinking,
        thinking_ms: thinkingMs,
      })
      .select()
      .single();
    if (error) throw error;
    send({ type: "done", message });
  });
}

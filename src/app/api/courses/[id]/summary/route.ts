import { embed } from "@/lib/ai/gemini";
import { modelChain } from "@/lib/ai/models";
import { loadCourseContext } from "@/lib/course/context";
import { summaryPrompt } from "@/lib/course/prompts";
import { finalizeCitations, formatSources, numberSources, type SourceChunk } from "@/lib/course/sources";
import { ndjsonResponse, streamAnswer } from "@/lib/course/stream";
import { neutralizeDelimiters } from "@/lib/security/llm";
import { enforceRateLimits, RATE_LIMITS, rateLimitResponse } from "@/lib/security/rate-limit";
import { isUuid, jsonError, readJsonBody, requireUser } from "@/lib/security/request";

// Au-delà, on ne garde que les extraits d'exercices les plus proches de la partie
const EXERCISES_FULL_MAX = 15_000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  if (!isUuid(courseId)) return jsonError("Cours introuvable", 404);
  const body = await readJsonBody<{ partId: unknown }>(request);
  if (body instanceof Response) return body;
  const { partId } = body;
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

  // Compté seulement quand un résumé va vraiment être généré
  const limited = await enforceRateLimits(user.id, RATE_LIMITS.summary);
  if (!limited.ok) return rateLimitResponse(limited);

  const { data: partChunks } = await supabase
    .from("chunks")
    .select("id, document_id, page, section, content, ordinal")
    .in("id", part.chunk_ids);
  const order = new Map<string, number>((part.chunk_ids as string[]).map((id, i) => [id, i]));
  const coursChunks: SourceChunk[] = (partChunks ?? []).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  if (coursChunks.length === 0) {
    return jsonError("Le contenu de cette partie a été supprimé. Relance l'analyse.", 409);
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

  const chunks = [...coursChunks, ...exoChunks];
  const sources = numberSources(chunks, ctx.documents);
  return ndjsonResponse(async (send) => {
    const { content, thinking, thinkingMs, model } = await streamAnswer(
      modelChain("summary", ctx.summaryModel),
      {
        system: summaryPrompt(ctx.level, exoChunks.length > 0),
        messages: [
          {
            role: "user",
            content: `Cours : « ${neutralizeDelimiters(ctx.course.title.slice(0, 200))} » — partie : « ${neutralizeDelimiters(String(part.title).slice(0, 200))} »\n\nSOURCES :\n\n${formatSources(sources, chunks)}`,
          },
        ],
        maxTokens: 16384,
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

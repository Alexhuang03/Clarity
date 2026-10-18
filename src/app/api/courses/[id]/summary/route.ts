import { embed } from "@/lib/ai/gemini";
import { modelChain, type ModelId } from "@/lib/ai/models";
import { streamWithFallback } from "@/lib/ai/providers";
import { loadCourseContext } from "@/lib/course/context";
import { summaryPrompt } from "@/lib/course/prompts";
import { finalizeCitations, formatSources, numberSources, type SourceChunk } from "@/lib/course/sources";
import { ndjsonResponse } from "@/lib/course/stream";
import { createClient } from "@/lib/supabase/server";

// Au-delà, on ne garde que les extraits d'exercices les plus proches de la partie
const EXERCISES_FULL_MAX = 15_000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  const { partId } = (await request.json()) as { partId?: string };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Non connecté" }, { status: 401 });

  const ctx = await loadCourseContext(supabase, courseId);
  if (!ctx) return Response.json({ error: "Cours introuvable" }, { status: 404 });

  const { data: part } = await supabase
    .from("course_parts")
    .select("id, title, chunk_ids")
    .eq("id", partId ?? "")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!part) return Response.json({ error: "Partie introuvable" }, { status: 404 });

  // Un résumé existe déjà pour cette partie : on ne le régénère pas (il est figé)
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("part_id", part.id)
    .eq("kind", "summary")
    .limit(1);
  if (existing?.length) return Response.json({ error: "Résumé déjà généré" }, { status: 409 });

  const { data: partChunks } = await supabase
    .from("chunks")
    .select("id, document_id, page, section, content, ordinal")
    .in("id", part.chunk_ids);
  const order = new Map<string, number>((part.chunk_ids as string[]).map((id, i) => [id, i]));
  const coursChunks: SourceChunk[] = (partChunks ?? []).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  if (coursChunks.length === 0) {
    return Response.json({ error: "Le contenu de cette partie a été supprimé. Relance l'analyse." }, { status: 409 });
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
  let model: ModelId | null = null;

  return ndjsonResponse(async (send) => {
    let content = "";
    for await (const text of streamWithFallback(
      modelChain("summary", ctx.summaryModel),
      {
        system: summaryPrompt(ctx.level, exoChunks.length > 0),
        messages: [
          {
            role: "user",
            content: `Cours : « ${ctx.course.title} » — partie : « ${part.title} »\n\nSOURCES :\n\n${formatSources(sources, chunks)}`,
          },
        ],
        maxTokens: 16384,
      },
      (m) => (model = m),
    )) {
      content += text;
      send({ type: "delta", text });
    }

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
      })
      .select()
      .single();
    if (error) throw error;
    send({ type: "done", message });
  });
}

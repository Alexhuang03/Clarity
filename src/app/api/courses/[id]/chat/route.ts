import { embed } from "@/lib/ai/gemini";
import { modelChain, type ModelId } from "@/lib/ai/models";
import { streamWithFallback, type ChatMessage } from "@/lib/ai/providers";
import { loadCourseContext } from "@/lib/course/context";
import { chatPrompt } from "@/lib/course/prompts";
import { finalizeCitations, formatSources, numberSources } from "@/lib/course/sources";
import { ndjsonResponse } from "@/lib/course/stream";
import { createClient } from "@/lib/supabase/server";

const MAX_QUESTION = 4000;
const HISTORY = 8;
// Un résumé peut être long : on n'en garde que le début dans l'historique envoyé à l'IA
const HISTORY_MESSAGE_MAX = 4000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  const { content: rawQuestion } = (await request.json()) as { content?: string };
  const question = rawQuestion?.trim().slice(0, MAX_QUESTION);
  if (!question) return Response.json({ error: "Question vide" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Non connecté" }, { status: 401 });

  const ctx = await loadCourseContext(supabase, courseId);
  if (!ctx) return Response.json({ error: "Cours introuvable" }, { status: 404 });
  if (ctx.documents.length === 0) {
    return Response.json({ error: "Ajoute d'abord un document à ce cours." }, { status: 409 });
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);

  const { data: userMessage, error: userError } = await supabase
    .from("messages")
    .insert({ course_id: courseId, role: "user", kind: "chat", content: question })
    .select()
    .single();
  if (userError) return Response.json({ error: "Impossible d'enregistrer la question" }, { status: 500 });

  // Recherche des extraits les plus pertinents pour la question
  const [query] = await embed([question], "RETRIEVAL_QUERY");
  const { data: matches } = await supabase.rpc("match_chunks", {
    p_course_id: courseId,
    p_query_embedding: JSON.stringify(query),
    p_match_count: 8,
  });
  const chunks = matches ?? [];
  const sources = numberSources(chunks, ctx.documents);

  const messages: ChatMessage[] = [
    ...(history ?? []).reverse().map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content.length > HISTORY_MESSAGE_MAX ? `${m.content.slice(0, HISTORY_MESSAGE_MAX)}…` : m.content,
    })),
    {
      role: "user",
      content: `SOURCES :\n\n${formatSources(sources, chunks) || "(aucun extrait pertinent)"}\n\nQUESTION :\n${question}`,
    },
  ];

  let model: ModelId | null = null;
  return ndjsonResponse(async (send) => {
    send({ type: "done", message: userMessage });
    let content = "";
    for await (const text of streamWithFallback(
      modelChain("chat", ctx.chatModel),
      { system: chatPrompt(ctx.level), messages, maxTokens: 4096 },
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
        role: "assistant",
        kind: "chat",
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

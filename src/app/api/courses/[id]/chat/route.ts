import { embed } from "@/lib/ai/gemini";
import { modelChain } from "@/lib/ai/models";
import type { ChatMessage } from "@/lib/ai/providers";
import { loadCourseContext } from "@/lib/course/context";
import { applicationPrompt, chatPrompt, greetingPrompt, offTopicPrompt } from "@/lib/course/prompts";
import { finalizeCitations, formatSources, numberSources, type SourceChunk } from "@/lib/course/sources";
import { ndjsonResponse, streamAnswer } from "@/lib/course/stream";
import { understandQuestion, type Intent } from "@/lib/course/understand";
import { createClient } from "@/lib/supabase/server";

const MAX_QUESTION = 4000;
// Historique court : seulement les derniers échanges de la conversation. Les résumés n'y sont pas :
// trop longs, ils noyaient la question (et les extraits utiles sont fournis à part).
const HISTORY = 6;
const HISTORY_MESSAGE_MAX = 1500;
const MAX_SOURCES = 6;
// Un extrait nettement moins proche de la question que le meilleur n'apporte que du bruit
const SIMILARITY_MARGIN = 0.12;

const INTENT_LABEL: Record<Intent, string> = {
  cours: "question sur le cours",
  etudes: "question d'études générale",
  application: "question sur Clarity",
  salutation: "salutation",
  hors_sujet: "hors sujet",
};

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

  const { data: recent } = await supabase
    .from("messages")
    .select("role, content")
    .eq("course_id", courseId)
    .eq("kind", "chat")
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  const history: ChatMessage[] = (recent ?? []).reverse().map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content.length > HISTORY_MESSAGE_MAX ? `${m.content.slice(0, HISTORY_MESSAGE_MAX)}…` : m.content,
  }));

  const { data: userMessage, error: userError } = await supabase
    .from("messages")
    .insert({ course_id: courseId, role: "user", kind: "chat", content: question })
    .select()
    .single();
  if (userError) return Response.json({ error: "Impossible d'enregistrer la question" }, { status: 500 });

  return ndjsonResponse(async (send) => {
    send({ type: "done", message: userMessage });

    // 1. Compréhension de la question : catégorie + reformulation autonome
    const understood = await understandQuestion(question, history, ctx.course.title);
    const reformulated = understood.question !== question;
    const analysis = `**Analyse de la question** : ${INTENT_LABEL[understood.intent]}${
      reformulated ? `\n\nQuestion comprise : « ${understood.question} »` : ""
    }\n\n`;

    // 2. Réponse adaptée à la catégorie
    let system: string;
    let messages: ChatMessage[];
    let sources = numberSources([], ctx.documents);

    if (understood.intent === "cours" || understood.intent === "etudes") {
      // Recherche des extraits avec la requête optimisée, puis filtrage des extraits peu pertinents
      const [query] = await embed([understood.search], "RETRIEVAL_QUERY");
      const { data: matches } = await supabase.rpc("match_chunks", {
        p_course_id: courseId,
        p_query_embedding: JSON.stringify(query),
        p_match_count: MAX_SOURCES,
      });
      const found = (matches ?? []) as (SourceChunk & { similarity: number })[];
      const best = found[0]?.similarity ?? 0;
      const chunks = found.filter((c) => c.similarity >= best - SIMILARITY_MARGIN);
      sources = numberSources(chunks, ctx.documents);

      system = chatPrompt(ctx.level);
      // La question d'abord (et rappelée à la fin) : elle ne doit jamais être noyée sous les extraits
      messages = [
        ...history,
        {
          role: "user",
          content: [
            `QUESTION ACTUELLE : ${question}`,
            reformulated ? `(Autrement dit : ${understood.question})` : "",
            `SOURCES :\n\n${formatSources(sources, chunks) || "(aucun extrait pertinent dans le cours)"}`,
            `Rappel : réponds uniquement à la question actuelle ci-dessus.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ];
    } else {
      // Pas besoin du cours : réponse courte, sans extraits ni historique
      system =
        understood.intent === "application"
          ? applicationPrompt()
          : understood.intent === "salutation"
            ? greetingPrompt(ctx.course.title)
            : offTopicPrompt(ctx.course.title);
      messages = [{ role: "user", content: question }];
    }

    send({ type: "thinking", text: analysis });
    const answer = await streamAnswer(
      modelChain("chat", ctx.chatModel),
      { system, messages, maxTokens: understood.intent === "cours" || understood.intent === "etudes" ? 4096 : 600 },
      send,
    );

    const final = finalizeCitations(answer.content, sources);
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        course_id: courseId,
        role: "assistant",
        kind: "chat",
        content: final.content,
        sources: final.sources,
        model: answer.model,
        thinking: `${analysis}${answer.thinking ?? ""}`.trim(),
        thinking_ms: answer.thinkingMs,
      })
      .select()
      .single();
    if (error) throw error;
    send({ type: "done", message });
  });
}

import { modelChain } from "@/lib/ai/models";
import type { ChatMessage } from "@/lib/ai/providers";
import { loadCourseContext } from "@/lib/course/context";
import { applicationPrompt, chatPrompt, greetingPrompt, offTopicPrompt } from "@/lib/course/prompts";
import { searchCourse as searchInCourse } from "@/lib/course/retrieve";
import { finalizeCitations, formatSources, numberSources } from "@/lib/course/sources";
import { ndjsonResponse, streamAnswer } from "@/lib/course/stream";
import { changesMeaning, quickUnderstanding, understandQuestion, type Intent } from "@/lib/course/understand";
import { createClient } from "@/lib/supabase/server";

const MAX_QUESTION = 4000;
// Historique court : seulement les derniers échanges de la conversation. Les résumés n'y sont pas :
// trop longs, ils noyaient la question (et les extraits utiles sont fournis à part).
const HISTORY = 6;
const HISTORY_MESSAGE_MAX = 1500;
const MAX_SOURCES = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INTENT_LABEL: Record<Intent, string> = {
  cours: "question sur le cours",
  etudes: "question d'études générale",
  application: "question sur Clarity",
  salutation: "salutation",
  hors_sujet: "hors sujet",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  const { content: rawQuestion, rewindFrom } = (await request.json()) as { content?: string; rewindFrom?: string };
  const question = rawQuestion?.trim().slice(0, MAX_QUESTION);
  if (!question) return Response.json({ error: "Question vide" }, { status: 400 });
  if (rewindFrom !== undefined && (typeof rewindFrom !== "string" || !UUID.test(rewindFrom))) {
    return Response.json({ error: "Message introuvable" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Non connecté" }, { status: 401 });

  const readHistory = () =>
    supabase
      .from("messages")
      .select("role, content")
      .eq("course_id", courseId)
      .eq("kind", "chat")
      .order("created_at", { ascending: false })
      .limit(HISTORY);

  // Contexte du cours et historique lus en parallèle (l'historique avant d'enregistrer la nouvelle question).
  // Retour en arrière : l'historique est relu après avoir retiré la suite de la conversation.
  const [ctx, first] = await Promise.all([loadCourseContext(supabase, courseId), rewindFrom ? null : readHistory()]);
  if (!ctx) return Response.json({ error: "Cours introuvable" }, { status: 404 });
  if (ctx.documents.length === 0) {
    return Response.json({ error: "Ajoute d'abord un document à ce cours." }, { status: 409 });
  }
  if (rewindFrom) {
    const rewound = await rewind(supabase, courseId, rewindFrom);
    if (rewound) return Response.json({ error: rewound }, { status: 409 });
  }
  const { data: recent } = first ?? (await readHistory());
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

    const t0 = Date.now();
    const searchCourse = (text: string) => searchInCourse(supabase, courseId, text, MAX_SOURCES);

    // 1. Compréhension de la question : catégorie + reformulation autonome.
    // Une simple politesse (« merci », « bonjour ») est reconnue sans appeler l'IA.
    const quick = quickUnderstanding(question);
    // Pendant l'analyse, la recherche démarre déjà avec la question telle quelle (échec = on refera la recherche)
    const early = quick ? null : searchCourse(question).catch(() => null);
    const understood = quick ?? (await understandQuestion(question, history, ctx.course.title));
    const tAnalysis = Date.now();
    const reformulated = understood.question !== question;
    const analysis = `**Analyse de la question** : ${INTENT_LABEL[understood.intent]}${quick ? " (reconnue sans IA)" : ""}${
      reformulated ? `\n\nQuestion comprise : « ${understood.question} »` : ""
    }\n\n`;

    // 2. Réponse adaptée à la catégorie
    let system: string;
    let messages: ChatMessage[];
    let sources = numberSources([], ctx.documents);
    let searchMode = "aucune";

    if (understood.intent === "cours" || understood.intent === "etudes") {
      // La recherche anticipée suffit, sauf si la reformulation change ce qu'il faut chercher
      // (« explique-la encore » → « explique la loi binomiale ») : on cherche alors avec la requête optimisée.
      let chunks = changesMeaning(question, understood.question) ? null : await early;
      searchMode = chunks ? "anticipée" : "refaite après reformulation";
      chunks ??= await searchCourse(understood.search);
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
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[chat] ${understood.intent}${quick ? " (règle)" : ""} · analyse ${tAnalysis - t0} ms · recherche ${searchMode} · prêt à répondre en ${Date.now() - t0} ms`,
      );
    }
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

/**
 * Retour à une question précédente : cette question et toute la suite de la discussion sont supprimées
 * (avec leurs annotations), la nouvelle version prend leur place. Les résumés du cours ne sont jamais touchés.
 * Renvoie un message d'erreur, ou null si tout s'est bien passé.
 */
async function rewind(supabase: Awaited<ReturnType<typeof createClient>>, courseId: string, messageId: string) {
  const { data: from } = await supabase
    .from("messages")
    .select("created_at")
    .eq("id", messageId)
    .eq("course_id", courseId)
    .eq("role", "user")
    .eq("kind", "chat")
    .maybeSingle();
  if (!from) return "Ce message n'existe plus. Recharge la page.";
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("course_id", courseId)
    .eq("kind", "chat")
    .gte("created_at", from.created_at);
  return error ? "Impossible de revenir à ce message. Réessaie." : null;
}

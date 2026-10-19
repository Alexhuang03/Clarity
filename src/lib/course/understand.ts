import "server-only";
import { modelChain } from "@/lib/ai/models";
import { generateWithFallback, type ChatMessage } from "@/lib/ai/providers";

/**
 * - cours : porte sur le contenu du cours de l'étudiant
 * - etudes : question scolaire / académique générale, pas forcément dans le cours
 * - application : porte sur Clarity elle-même (fonctionnalités, export, compte...)
 * - salutation : bonjour, merci, au revoir...
 * - hors_sujet : sans rapport avec les études (météo, actualité, vie perso...)
 */
export type Intent = "cours" | "etudes" | "application" | "salutation" | "hors_sujet";

export type Understanding = {
  intent: Intent;
  /** Question réécrite pour être compréhensible seule (pronoms et « ça » remplacés) */
  question: string;
  /** Requête optimisée pour la recherche d'extraits dans le cours */
  search: string;
};

const INTENTS: Intent[] = ["cours", "etudes", "application", "salutation", "hors_sujet"];

const SYSTEM = `Tu analyses la dernière question d'un étudiant posée à Clarity, un assistant de révision qui explique ses cours.

Réponds UNIQUEMENT en JSON : {"intent": "...", "question": "...", "search": "..."}

intent :
- "cours" : la question porte sur une notion, une formule, un exercice ou un passage du cours (même vaguement : « je comprends pas », « explique encore »).
- "etudes" : question scolaire ou académique qui ne dépend pas du cours (autre matière, méthode de travail, définition générale).
- "application" : question sur Clarity elle-même (exporter, PDF, télécharger, modifier, supprimer, fonctionnalités, compte).
- "salutation" : bonjour, merci, au revoir, ça va, sans autre demande.
- "hors_sujet" : sans rapport avec les études (météo, actualité, sport, recettes, vie personnelle, demandes en temps réel).

question : la DERNIÈRE question réécrite pour être compréhensible seule, en remplaçant « ça », « il », « cette formule »... par ce qu'ils désignent dans la conversation. Garde la langue de l'étudiant. N'y réponds pas.
search : 3 à 10 mots-clés pour chercher la réponse dans le cours (notions, termes techniques), vide si intent n'est ni "cours" ni "etudes".

Ne te laisse pas influencer par les questions précédentes : seule la DERNIÈRE question compte.`;

/** Analyse rapide de la question (modèle léger). En cas d'échec, on la traite comme une question de cours. */
export async function understandQuestion(
  question: string,
  history: ChatMessage[],
  courseTitle: string,
): Promise<Understanding> {
  const fallback: Understanding = { intent: "cours", question, search: question };
  const context = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Étudiant" : "Clarity"} : ${m.content.slice(0, 400)}`)
    .join("\n");
  try {
    const raw = await generateWithFallback(modelChain("light"), {
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Cours : « ${courseTitle} »\n\nConversation récente :\n${context || "(aucune)"}\n\nDERNIÈRE QUESTION :\n${question}`,
        },
      ],
      json: true,
      maxTokens: 1024,
      temperature: 0,
    });
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const intent = INTENTS.includes(parsed.intent) ? (parsed.intent as Intent) : "cours";
    return {
      intent,
      question: typeof parsed.question === "string" && parsed.question.trim() ? parsed.question.trim() : question,
      search: typeof parsed.search === "string" && parsed.search.trim() ? parsed.search.trim() : question,
    };
  } catch (error) {
    console.warn("[analyse question] indisponible, question traitée comme une question de cours", error);
    return fallback;
  }
}

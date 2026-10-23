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

/** Minuscules, sans accents ni ponctuation ni émojis, espaces simplifiés. */
export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Messages qui ne sont QUE des politesses : le message entier doit correspondre,
// donc « merci, mais pourquoi n = 10 ? » passe bien par l'analyse complète.
const GREETING_WORDS = [
  "bonjour", "bonsoir", "salut", "coucou", "hello", "hey", "hi", "yo", "re",
  "merci", "thanks", "thx", "ty",
  "au revoir", "bye", "a plus", "a+", "a bientot", "a demain", "bonne nuit", "bonne soiree", "bonne journee",
  "ca va", "comment ca va", "comment vas tu", "tu vas bien",
];
const GREETING_FILLERS = [
  "ok", "okay", "d'accord", "dac", "super", "top", "parfait", "genial", "cool", "nickel", "trop bien",
  "beaucoup", "bcp", "infiniment", "encore", "mille fois", "a toi", "clarity", "et toi", "toi", "bien", "oui", "tres",
];
const GREETING = new RegExp(
  `^(?:(?:${[...GREETING_WORDS, ...GREETING_FILLERS]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[+]/g, "\\$&"))
    .join("|")})(?: |$))+$`,
);

/**
 * Reconnaît sans IA un message qui n'est qu'une salutation ou un remerciement
 * (« merci ! », « ok super merci beaucoup », « bonjour 👋 »). Null si ce n'est pas évident.
 */
export function quickUnderstanding(question: string): Understanding | null {
  const text = normalizeText(question);
  if (!text || text.length > 60) return null;
  // Au moins un vrai mot de politesse : « ok » ou « super » seuls restent ambigus (« ok, et ensuite ? »)
  const hasGreeting = GREETING_WORDS.some((w) => new RegExp(`(?:^| )${w.replace(/[+]/g, "\\+")}(?: |$)`).test(text));
  return hasGreeting && GREETING.test(text) ?{ intent: "salutation", question, search: "" } : null;
}

// Mots qui ne changent pas le sens d'une question (pour comparer la question et sa reformulation)
const STOPWORDS = new Set(
  ("le la les un une des du de d l au aux a et ou en dans sur pour par avec sans ce cet cette ces ca cela " +
    "je tu il elle on nous vous ils elles me te se mon ma mes ton ta tes son sa ses qui que quoi quel quelle quels quelles " +
    "est sont etre c qu s n ne pas plus comment pourquoi quand combien veut dire signifie explique expliquer moi peux " +
    "pourrais stp svp the what is are how why does do this that it of to in").split(" "),
);

/** Mots porteurs de sens (sans mots vides, ni accents, ni marques de pluriel simples). */
export function contentWords(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/[ ']/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map((w) => w.replace(/(?:s|x)$/, "")),
  );
}

/**
 * La reformulation change-t-elle vraiment ce qu'il faut chercher ?
 * Oui si elle apporte des mots porteurs de sens absents de la question
 * (typiquement « ça » remplacé par « la loi binomiale »).
 */
export function changesMeaning(original: string, reformulated: string): boolean {
  if (normalizeText(original) === normalizeText(reformulated)) return false;
  const before = contentWords(original);
  return [...contentWords(reformulated)].some((w) => !before.has(w));
}

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

const ANALYSIS_TIMEOUT_MS = 4000;

/**
 * Analyse rapide de la question (modèle léger, réflexion minimale, 4 s au plus).
 * En cas d'échec ou de lenteur, on la traite comme une question de cours, telle quelle.
 */
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
    const raw = await generateWithFallback(modelChain("analysis"), {
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
      fast: true,
      // Au-delà, l'analyse coûterait plus qu'elle ne rapporte : la question est traitée telle quelle
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
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

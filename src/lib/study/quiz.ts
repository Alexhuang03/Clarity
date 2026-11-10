import "server-only";
import type { ModelId } from "@/lib/ai/models";
import type { Source } from "@/lib/course/sources";
import { untrusted } from "@/lib/security/llm";
import { pickSources } from "./content";
import { generateJson } from "./llm";
import { answerBlock, gradingPrompt } from "./prompts";
import type {
  AnswerValue,
  Answers,
  Difficulty,
  PublicQuestion,
  Question,
  QuestionResult,
  QuestionType,
  QuizMode,
} from "./types";
import { fixLatexEscapes, v, type Schema } from "./validate";

const PROMPT_MAX = 1500;
const CHOICE_MAX = 400;
const TEXT_MAX = 1500;
const CONCEPT_MAX = 80;
/** Réponse rédigée de l'élève : au-delà, elle est coupée avant correction */
export const ANSWER_MAX = 6000;

const DIFFICULTIES: Difficulty[] = ["facile", "moyen", "difficile"];
const DEFAULT_POINTS: Record<QuestionType, number> = { single: 1, truefalse: 1, multiple: 2, short: 2, open: 6 };

type Raw = Record<string, unknown>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const text = (value: unknown, max: number) =>
  typeof value === "string" || typeof value === "number" ? fixLatexEscapes(String(value).trim()).slice(0, max) : "";

const index = (value: unknown, length: number) => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < length ? n : null;
};

const numbers = (value: unknown) =>
  Array.isArray(value) ? value.map((n) => Number(String(n).replace(/[^\d]/g, ""))).filter((n) => Number.isInteger(n)) : [];

/** Question renvoyée par l'IA → question propre, ou null si elle est inutilisable. */
function normalizeQuestion(raw: Raw, allowed: QuestionType[], sources: Source[], quick: boolean): DistributiveOmit<Question, "id"> | null {
  const type = raw.type as QuestionType;
  if (!allowed.includes(type)) return null;
  const prompt = text(raw.prompt, PROMPT_MAX);
  if (prompt.length < 5) return null;
  const base = {
    prompt,
    concept: text(raw.concept, CONCEPT_MAX) || "Notion générale",
    difficulty: DIFFICULTIES.includes(raw.difficulty as Difficulty) ? (raw.difficulty as Difficulty) : ("moyen" as const),
    explanation: text(raw.explanation, TEXT_MAX),
    sources: pickSources(numbers(raw.sources), sources),
    points: quick ? 1 : DEFAULT_POINTS[type],
  };
  if (type === "single" || type === "multiple") {
    const choices = Array.isArray(raw.choices) ? raw.choices.map((c) => text(c, CHOICE_MAX)).filter(Boolean) : [];
    if (choices.length < 2 || choices.length > 6 || new Set(choices).size !== choices.length) return null;
    if (type === "single") {
      const answer = index(raw.answer, choices.length);
      return answer === null ? null : { ...base, type, choices, answer };
    }
    const list = Array.isArray(raw.answers) ? raw.answers : [raw.answers];
    const answers = [...new Set(list.map((a) => index(a, choices.length)).filter((a): a is number => a !== null))].sort();
    if (!answers.length) return null;
    // Une seule bonne réponse : c'est en réalité un QCM simple
    if (answers.length === 1) return { ...base, type: "single", points: quick ? 1 : DEFAULT_POINTS.single, choices, answer: answers[0] };
    return { ...base, type, choices, answers };
  }
  if (type === "truefalse") {
    const answer = v.boolean()(raw.answer, "answer");
    return answer.ok ? { ...base, type, answer: answer.value } : null;
  }
  const expected = text(raw.expected, TEXT_MAX);
  if (!expected) return null;
  if (type === "short") return { ...base, type, expected };
  // Question ouverte : barème obligatoire (points entiers ou demi-points)
  const rubric = (Array.isArray(raw.rubric) ? raw.rubric : [])
    .map((r: Raw) => ({
      criterion: text(r?.criterion, 300),
      points: Math.round(Math.min(10, Math.max(0, Number(r?.points) || 0)) * 2) / 2,
    }))
    .filter((r) => r.criterion && r.points > 0)
    .slice(0, 6);
  if (!rubric.length) return null;
  return { ...base, type, expected, rubric, points: rubric.reduce((n, r) => n + r.points, 0) };
}

/** Schéma de la réponse de l'IA : au moins ~70 % des questions demandées doivent être exploitables. */
export function quizSchema(opts: { count: number; types: QuestionType[]; sources: Source[]; quick: boolean }): Schema<{
  title: string;
  questions: Question[];
}> {
  return (input, path) => {
    if (typeof input !== "object" || input === null) return { ok: false, error: `${path || "réponse"} : objet attendu` };
    const obj = input as Raw;
    const rawList = Array.isArray(obj.questions) ? (obj.questions as Raw[]) : [];
    const seen = new Set<string>();
    const questions: Question[] = [];
    for (const raw of rawList) {
      if (typeof raw !== "object" || raw === null) continue;
      const q = normalizeQuestion(raw, opts.types, opts.sources, opts.quick);
      if (!q || seen.has(q.prompt.toLowerCase())) continue;
      seen.add(q.prompt.toLowerCase());
      questions.push({ ...q, id: `q${questions.length + 1}` } as Question);
      if (questions.length >= opts.count) break;
    }
    const needed = Math.max(1, Math.ceil(opts.count * 0.7));
    if (questions.length < needed) {
      return { ok: false, error: `seulement ${questions.length} question(s) valide(s) sur ${opts.count} demandées` };
    }
    return { ok: true, value: { title: text(obj.title, 150) || "Quiz", questions } };
  };
}

/** Version sans réponses, envoyée pendant la tentative. */
export function toPublic(q: Question): PublicQuestion {
  const base = { id: q.id, prompt: q.prompt, concept: q.concept, difficulty: q.difficulty, points: q.points };
  if (q.type === "single" || q.type === "multiple") return { ...base, type: q.type, choices: q.choices };
  return { ...base, type: q.type };
}

// ------------------------------------------------------------------ Correction

const isEmpty = (a: AnswerValue | undefined) =>
  a === null || a === undefined || (typeof a === "string" && !a.trim()) || (Array.isArray(a) && !a.length);

/** Normalise une réponse courte pour une comparaison exacte (accents, casse, ponctuation, articles). */
function normalizeShort(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(le|la|les|l|un|une|des|du|de|d)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Réponse reçue → valeur cohérente avec le type de question (le reste est ignoré). */
export function sanitizeAnswer(q: Question, a: unknown): AnswerValue {
  if (a === null || a === undefined) return null;
  switch (q.type) {
    case "single":
      return typeof a === "number" && Number.isInteger(a) && a >= 0 && a < q.choices.length ? a : null;
    case "multiple":
      return Array.isArray(a)
        ? [...new Set(a.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < q.choices.length))].sort()
        : null;
    case "truefalse":
      return typeof a === "boolean" ? a : null;
    default:
      return typeof a === "string" ? a.slice(0, ANSWER_MAX) : null;
  }
}

const status = (score: number, max: number): QuestionResult["status"] =>
  score >= max - 1e-9 ? "correct" : score > 0 ? "partial" : "incorrect";

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** Correction automatique (QCM, vrai/faux, réponse courte identique). null = l'IA doit corriger. */
function gradeObjective(q: Question, given: AnswerValue): QuestionResult | null {
  const base = { questionId: q.id, maxScore: q.points, given, feedback: null };
  if (isEmpty(given)) return { ...base, status: "unanswered", score: 0 };
  switch (q.type) {
    case "single":
    case "truefalse": {
      const score = given === q.answer ? q.points : 0;
      return { ...base, status: status(score, q.points), score };
    }
    case "multiple": {
      const picked = given as number[];
      const right = picked.filter((i) => q.answers.includes(i)).length;
      const wrong = picked.length - right;
      const score = roundHalf(Math.max(0, (right - wrong) / q.answers.length) * q.points);
      return { ...base, status: status(score, q.points), score };
    }
    case "short":
      return normalizeShort(given as string) === normalizeShort(q.expected)
        ? { ...base, status: "correct", score: q.points }
        : null;
    case "open":
      return null;
  }
}

const gradesSchema = v.object({
  grades: v.array(
    v.object({
      id: v.string({ max: 20 }),
      score: v.number({ min: 0 }),
      feedback: v.lenient(v.string({ max: 1200 }), ""),
      rubric: v.optional(
        v.array(v.object({ criterion: v.lenient(v.string({ max: 300 }), ""), points: v.number({ min: 0 }) }), {
          dropInvalid: true,
        }),
      ),
    }),
    { dropInvalid: true },
  ),
  overall: v.lenient(v.string({ max: 2000 }), ""),
});

export type Grading = { results: QuestionResult[]; score: number; maxScore: number; feedback: string | null; model: ModelId | null };

/**
 * Corrige une tentative : QCM et vrai/faux automatiquement, réponses rédigées par l'IA (barème pour les
 * questions ouvertes). Lève une StudyError si l'IA est indisponible alors qu'il y a des réponses à corriger.
 */
export async function gradeAttempt(
  chain: ModelId[],
  mode: QuizMode,
  questions: Question[],
  answers: Answers,
  /** Appelé avant chaque appel supplémentaire à l'IA (correction, autre modèle) : limite de débit */
  beforeRetry?: () => Promise<void>,
): Promise<Grading> {
  const results = new Map<string, QuestionResult>();
  const toGrade: Question[] = [];
  for (const q of questions) {
    const given = sanitizeAnswer(q, answers[q.id]);
    const r = gradeObjective(q, given);
    if (r) results.set(q.id, r);
    else toGrade.push(q);
  }

  let overall: string | null = null;
  let model: ModelId | null = null;
  if (toGrade.length) {
    const items = toGrade
      .map((q) => {
        // Énoncé, corrigé et barème viennent de l'IA (à partir d'un cours non fiable) : délimités eux aussi
        const rubric =
          q.type === "open"
            ? `\nBarème (critères dans l'ordre, points entre parenthèses) :\n${untrusted(
                `BARÈME ${q.id}`,
                q.rubric.map((r, i) => `${i + 1}. ${r.criterion} (${r.points} pt)`).join("\n"),
              )}`
            : "";
        const expected = q.type === "open" || q.type === "short" ? q.expected : "";
        return `### ${q.id} (${q.type === "open" ? "question ouverte" : "réponse courte"}, maxPoints = ${q.points})
Question :\n${untrusted(`QUESTION ${q.id}`, q.prompt)}
Réponse attendue :\n${untrusted(`ATTENDU ${q.id}`, expected)}${rubric}
Réponse de l'élève :\n${answerBlock(q.id, String(answers[q.id] ?? "").slice(0, ANSWER_MAX))}`;
      })
      .join("\n\n");
    const { value, model: used } = await generateJson(
      chain,
      { system: gradingPrompt(mode), user: `Réponses à corriger :\n\n${items}`, maxTokens: 4096, temperature: 0.1, beforeRetry },
      gradesSchema,
      "correction",
    );
    model = used;
    overall = value.overall || null;
    const byId = new Map(value.grades.map((g) => [g.id, g]));
    for (const q of toGrade) {
      const g = byId.get(q.id);
      const given = sanitizeAnswer(q, answers[q.id]);
      if (!g) {
        results.set(q.id, { questionId: q.id, status: "incorrect", score: 0, maxScore: q.points, given, feedback: "Réponse non corrigée par l'IA." });
        continue;
      }
      let score = roundHalf(Math.min(q.points, g.score));
      let rubricScores: QuestionResult["rubricScores"];
      if (q.type === "open") {
        rubricScores = q.rubric.map((r, i) => ({
          criterion: r.criterion,
          maxPoints: r.points,
          points: roundHalf(Math.min(r.points, Math.max(0, g.rubric?.[i]?.points ?? 0))),
        }));
        if (g.rubric?.length) score = Math.min(q.points, rubricScores.reduce((n, r) => n + r.points, 0));
      }
      results.set(q.id, {
        questionId: q.id,
        status: status(score, q.points),
        score,
        maxScore: q.points,
        given,
        feedback: fixLatexEscapes(g.feedback) || null,
        ...(rubricScores ? { rubricScores } : {}),
      });
    }
  }

  const ordered = questions.map((q) => results.get(q.id)!);
  const score = roundHalf(ordered.reduce((n, r) => n + r.score, 0));
  const maxScore = questions.reduce((n, q) => n + q.points, 0);
  return { results: ordered, score, maxScore, feedback: overall ?? defaultFeedback(questions, ordered), model };
}

function defaultFeedback(questions: Question[], results: QuestionResult[]): string | null {
  const missed = [
    ...new Set(questions.filter((_, i) => results[i].status !== "correct").map((q) => q.concept)),
  ].slice(0, 5);
  if (!missed.length) return "Sans faute, bravo !";
  return `Notions à revoir : ${missed.join(", ")}.`;
}

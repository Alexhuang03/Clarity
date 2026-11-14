import "server-only";
import { modelChain, type ModelId } from "@/lib/ai/models";
import { neutralizeDelimiters, untrusted } from "@/lib/security/llm";
import type { Locale } from "./language";
import { summaryPrompt, synthesisPrompt, type Level } from "./prompts";
import { formatSources, numberSources, type DocumentInfo, type Source, type SourceChunk } from "./sources";
import { streamAnswer, type StreamEvent } from "./stream";
import type { SummaryDetail } from "./summarize-config";

// Cours envoyé par appel selon le niveau de détail. Mesuré le 13/11/2026 (article « Loi binomiale », partie de
// 30 400 caractères, même modèle) : en un seul appel, 3 550 caractères de résumé (compression 8,5:1, 4 notions,
// phrases creuses) ; en 2 morceaux + synthèse, 10 000 caractères, 8 notions, chacune avec définition, formule
// expliquée et exemple résolu.
const SEGMENT_BUDGET: Record<SummaryDetail, number> = {
  concis: Infinity,
  detaille: 16_000,
  tres_detaille: 8_000,
};
const MAX_TOKENS: Record<SummaryDetail, number> = { concis: 6000, detaille: 12_000, tres_detaille: 16_000 };
/** Morceaux au plus par résumé (en plus de la synthèse) : borne le coût d'une partie quelle que soit sa taille */
const MAX_SEGMENTS = 4;
// Le dernier morceau est fusionné avec le précédent s'il est plus petit que ça (fraction du budget)
const MIN_LAST_SEGMENT = 0.35;
// Résumé transmis à l'étape de synthèse (pièges, à retenir)
const SYNTHESIS_INPUT_MAX = 40_000;

export type SummaryInput = {
  courseTitle: string;
  partTitle: string;
  coursChunks: SourceChunk[];
  exoChunks: SourceChunk[];
  documents: DocumentInfo[];
  level: Level;
  locale: Locale;
  detail: SummaryDetail;
  /** Chaîne de modèles des résumés (modèle préféré de l'utilisateur en tête) */
  chain: ModelId[];
};

export type SummaryResult = {
  content: string;
  sources: Source[];
  thinking: string | null;
  thinkingMs: number | null;
  model: string | null;
  /** Nombre d'appels à l'IA (morceaux + synthèse) */
  calls: number;
};

/**
 * Découpe les morceaux de cours en segments d'au plus `budget` caractères, de préférence à un changement de section.
 * Renvoie des listes d'indices (dans l'ordre).
 */
export function segmentChunks(
  chunks: { content: string; section: string | null }[],
  budget: number,
  maxSegments = MAX_SEGMENTS,
): number[][] {
  const total = chunks.reduce((n, c) => n + c.content.length, 0);
  if (!Number.isFinite(budget) || total <= budget * (1 + MIN_LAST_SEGMENT)) return [chunks.map((_, i) => i)];
  // Taille équilibrée : 40 000 caractères en 3 x 13 300 plutôt que 16 000 + 16 000 + 8 000
  const target = total / Math.ceil(total / budget);
  const segments: number[][] = [];
  let current: number[] = [];
  let size = 0;
  chunks.forEach((chunk, i) => {
    const newSection = i > 0 && chunk.section !== chunks[i - 1].section;
    if (current.length && ((size >= target * 0.9 && newSection) || size + chunk.content.length > target * 1.25)) {
      segments.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += chunk.content.length;
  });
  if (current.length) {
    const last = segments[segments.length - 1];
    if (last && size < target * MIN_LAST_SEGMENT) last.push(...current);
    else segments.push(current);
  }
  // Plafond strict (coût d'un résumé borné) : on fusionne les deux segments voisins les plus petits
  const sizeOf = (segment: number[]) => segment.reduce((n, i) => n + chunks[i].content.length, 0);
  while (segments.length > Math.max(1, maxSegments)) {
    let best = 0;
    for (let i = 1; i < segments.length - 1; i++) {
      if (sizeOf(segments[i]) + sizeOf(segments[i + 1]) < sizeOf(segments[best]) + sizeOf(segments[best + 1])) best = i;
    }
    segments.splice(best, 2, [...segments[best], ...segments[best + 1]]);
  }
  return segments;
}

/** Cours envoyé par morceau : budget du niveau de détail, élargi pour ne jamais dépasser MAX_SEGMENTS morceaux. */
function segmentBudget(chunks: { content: string }[], detail: SummaryDetail): number {
  const total = chunks.reduce((n, c) => n + c.content.length, 0);
  return Math.max(SEGMENT_BUDGET[detail], total / MAX_SEGMENTS);
}

/** Nombre d'appels à l'IA qu'un résumé fera (morceaux + synthèse) : la limite de débit est comptée par appel. */
export function planSummaryCalls(chunks: { content: string; section: string | null }[], detail: SummaryDetail): number {
  const segments = segmentChunks(chunks, segmentBudget(chunks, detail)).length;
  return segments > 1 ? segments + 1 : 1;
}

/** Titre (saisi par l'utilisateur) sur une ligne, entre guillemets : sans balises, retours ni guillemets. */
const inlineTitle = (title: string) =>
  neutralizeDelimiters(title.replace(/\s+/g, " ").trim().slice(0, 200)).replace(/[«»]/g, '"');

/** Titres de section des sources, dans l'ordre et sans doublon. */
const sectionsOf = (chunks: SourceChunk[]) => [...new Set(chunks.map((c) => c.section?.trim()).filter((s): s is string => !!s))];

/** Titres ### déjà rédigés (pour faire des liens sans répéter). */
const notionTitles = (markdown: string) =>
  [...markdown.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].replace(/[*_`]/g, "").trim()).slice(0, 60);

/**
 * Résumé d'une partie à partir de TOUS ses morceaux : un appel par segment (rédigés à la suite, en flux),
 * puis, s'il y a plusieurs segments, une courte synthèse (pièges, à retenir) sur le modèle léger.
 */
export async function generateSummary(input: SummaryInput, send: (event: StreamEvent) => void): Promise<SummaryResult> {
  const chunks = [...input.coursChunks, ...input.exoChunks];
  const sources = numberSources(chunks, input.documents);
  const exoIndices = input.exoChunks.map((_, i) => input.coursChunks.length + i);
  const segments = segmentChunks(input.coursChunks, segmentBudget(input.coursChunks, input.detail));
  const plan = sectionsOf(input.coursChunks);
  const header = `Cours : « ${inlineTitle(input.courseTitle)} » — partie : « ${inlineTitle(input.partTitle)} »`;

  const parts: string[] = [];
  const thoughts: string[] = [];
  const models = new Set<string>();
  let thinkingMs: number | null = null;

  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    const indices = last ? [...segment, ...exoIndices] : segment;
    const own = sectionsOf(segment.map((i) => chunks[i]));
    const context =
      segments.length > 1
        ? [
            `PLAN DE LA PARTIE (titres de section des sources) :\n${untrusted("PLAN", plan.map((s) => `- ${s}${own.includes(s) ? "  ← ton morceau" : ""}`).join("\n"), 6000)}`,
            index > 0 ? `NOTIONS DÉJÀ TRAITÉES dans les morceaux précédents :\n${untrusted("NOTIONS DÉJÀ TRAITÉES", notionTitles(parts.join("\n\n")).map((t) => `- ${t}`).join("\n") || "(aucune)", 4000)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        : "";
    if (index > 0) send({ type: "delta", text: "\n\n" });
    const answer = await streamAnswer(
      input.chain,
      {
        system: summaryPrompt(input.level, {
          hasExercises: input.exoChunks.length > 0,
          locale: input.locale,
          detail: input.detail,
          segment: { index, total: segments.length },
        }),
        messages: [
          {
            role: "user",
            content: [header, context, `SOURCES :\n\n${formatSources(indices.map((i) => sources[i]), indices.map((i) => chunks[i]))}`]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        maxTokens: MAX_TOKENS[input.detail],
      },
      send,
    );
    parts.push(answer.content.trim());
    if (answer.thinking) thoughts.push(answer.thinking);
    if (answer.model) models.add(answer.model);
    thinkingMs ??= answer.thinkingMs;
  }

  let calls = segments.length;
  if (segments.length > 1) {
    // Pièges et points à retenir de TOUTE la partie : petite tâche, sur le modèle léger (quota large)
    send({ type: "delta", text: "\n\n" });
    const draft = parts.join("\n\n");
    const synthesis = await streamAnswer(
      modelChain("light"),
      {
        system: synthesisPrompt(input.locale),
        messages: [{ role: "user", content: untrusted("RÉSUMÉ", draft, SYNTHESIS_INPUT_MAX) }],
        maxTokens: 3000,
        temperature: 0.3,
      },
      send,
    );
    parts.push(synthesis.content.trim());
    if (synthesis.model) models.add(synthesis.model);
    calls += 1;
  }

  return {
    content: parts.join("\n\n"),
    sources,
    thinking: thoughts.join("\n\n---\n\n").trim() || null,
    thinkingMs,
    model: [...models].join(" + ") || null,
    calls,
  };
}

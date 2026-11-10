import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "@/lib/ai/gemini";
import type { loadCourseContext } from "@/lib/course/context";
import { formatSources, numberSources, type Source, type SourceChunk } from "@/lib/course/sources";
import { StudyError } from "./llm";
import { courseBlock } from "./prompts";
import type { StudyScope } from "./types";

export type CourseContext = NonNullable<Awaited<ReturnType<typeof loadCourseContext>>>;

// Lecture des morceaux par pages (PostgREST renvoie au plus 1 000 lignes par requête)
const PAGE = 1000;
const MAX_CHUNKS = 5000;
// Un morceau très long est coupé : mieux vaut couvrir plus de passages du cours
const CHUNK_MAX = 3000;

export type ScopedContent = {
  chunks: SourceChunk[];
  sources: Source[];
  /** Bloc prêt à envoyer à l'IA (délimité, extraits numérotés) */
  block: string;
  /** Le cours dépassait le budget : seule une sélection répartie est envoyée */
  truncated: boolean;
};

/** Identifiants des documents et morceaux visés par un périmètre (null = tout). */
async function resolveScope(
  supabase: SupabaseClient,
  ctx: CourseContext,
  scope: StudyScope,
): Promise<{ documentIds: string[]; chunkIds: Set<string> | null; wholeDocs: Set<string> }> {
  const partIds = scope.partIds ?? [];
  const documentIds = scope.documentIds ?? [];
  if (!partIds.length && !documentIds.length) return { documentIds: ctx.documents.map((d) => d.id), chunkIds: null, wholeDocs: new Set<string>() };

  const ready = new Set(ctx.documents.map((d) => d.id));
  const docs = new Set(documentIds.filter((id) => ready.has(id)));
  let chunkIds: Set<string> | null = null;
  if (partIds.length) {
    const { data: parts, error } = await supabase
      .from("course_parts")
      .select("id, chunk_ids")
      .eq("course_id", ctx.course.id)
      .in("id", partIds);
    if (error) throw error;
    chunkIds = new Set((parts ?? []).flatMap((p) => p.chunk_ids as string[]));
  }
  if (!docs.size && !chunkIds?.size) throw new StudyError("La sélection est vide : choisis au moins une partie ou un document prêt.");
  // Morceaux des parties choisies (tous documents prêts) + tous ceux des documents choisis
  return { documentIds: chunkIds?.size ? [...ready] : [...docs], chunkIds, wholeDocs: docs };
}

async function fetchChunks(supabase: SupabaseClient, courseId: string, documentIds: string[]) {
  const rows: (SourceChunk & { ordinal: number })[] = [];
  for (let from = 0; from < MAX_CHUNKS; from += PAGE) {
    const { data, error } = await supabase
      .from("chunks")
      .select("id, document_id, page, section, content, ordinal")
      .eq("course_id", courseId)
      .in("document_id", documentIds)
      .order("document_id")
      .order("ordinal")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Garde une sélection de morceaux répartie sur tout le cours (début, milieu, fin) dans la limite du budget.
 * `shuffle` décale le point de départ : deux générations successives ne voient pas exactement les mêmes passages.
 */
export function sampleWithinBudget<T extends { content: string }>(chunks: T[], budget: number, shuffle = false) {
  const trimmed = chunks.map((c) => (c.content.length > CHUNK_MAX ? { ...c, content: `${c.content.slice(0, CHUNK_MAX)}…` } : c));
  const total = trimmed.reduce((n, c) => n + c.content.length, 0);
  if (total <= budget) return { chunks: trimmed, truncated: false };
  const ratio = budget / total;
  let credit = shuffle ? Math.random() * CHUNK_MAX : 0;
  let used = 0;
  const kept: T[] = [];
  for (const c of trimmed) {
    credit += c.content.length * ratio;
    if (credit >= c.content.length && used + c.content.length <= budget) {
      credit -= c.content.length;
      used += c.content.length;
      kept.push(c);
    }
  }
  return { chunks: kept.length ? kept : trimmed.slice(0, 1), truncated: true };
}

/** Contenu du cours (ou de la sélection), ordonné et limité à `budget` caractères. */
export async function loadScopedContent(
  supabase: SupabaseClient,
  ctx: CourseContext,
  scope: StudyScope,
  budget: number,
  opts: { shuffle?: boolean } = {},
): Promise<ScopedContent> {
  if (!ctx.documents.length) throw new StudyError("Ajoute d'abord un document à ce cours.", 409);
  const resolved = await resolveScope(supabase, ctx, scope);
  const { data: docOrder } = await supabase
    .from("documents")
    .select("id")
    .eq("course_id", ctx.course.id)
    .order("created_at");
  const order = new Map((docOrder ?? []).map((d, i) => [d.id as string, i]));

  let rows = await fetchChunks(supabase, ctx.course.id, resolved.documentIds);
  if (resolved.chunkIds) {
    const ids = resolved.chunkIds;
    rows = rows.filter((c) => ids.has(c.id) || resolved.wholeDocs.has(c.document_id));
  }
  rows.sort((a, b) => (order.get(a.document_id) ?? 0) - (order.get(b.document_id) ?? 0) || a.ordinal - b.ordinal);
  if (!rows.length) throw new StudyError("Aucun texte exploitable dans la sélection.", 409);

  const { chunks, truncated } = sampleWithinBudget(rows, budget, opts.shuffle);
  return build(ctx, chunks, truncated);
}

/**
 * Passages du cours les plus proches de certaines notions (recherche sémantique), limités au budget.
 * Repli sur une sélection répartie si la recherche échoue ou ne trouve rien.
 */
export async function loadConceptContent(
  supabase: SupabaseClient,
  ctx: CourseContext,
  concepts: string[],
  budget: number,
): Promise<ScopedContent> {
  try {
    const [query] = await embed([concepts.join(" ; ")], "RETRIEVAL_QUERY");
    const { data, error } = await supabase.rpc("match_chunks", {
      p_course_id: ctx.course.id,
      p_query_embedding: JSON.stringify(query),
      p_match_count: 12,
    });
    if (error) throw error;
    const found = (data ?? []) as SourceChunk[];
    if (found.length) {
      const { chunks, truncated } = sampleWithinBudget(found, budget);
      return build(ctx, chunks, truncated);
    }
  } catch (error) {
    console.warn("[révision] recherche des notions faibles impossible, contenu réparti", error);
  }
  return loadScopedContent(supabase, ctx, {}, budget, { shuffle: true });
}

function build(ctx: CourseContext, chunks: SourceChunk[], truncated: boolean): ScopedContent {
  const sources = numberSources(chunks, ctx.documents);
  return { chunks, sources, block: courseBlock(ctx.course.title, formatSources(sources, chunks)), truncated };
}

/** Numéros [S1]... cités par l'IA → sources réelles (numéros inventés ignorés, 4 au plus). */
export function pickSources(numbers: number[] | undefined, sources: Source[], max = 4): Source[] {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const out: Source[] = [];
  for (const n of numbers ?? []) {
    const s = byN.get(n);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

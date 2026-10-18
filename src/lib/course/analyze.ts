import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { modelChain } from "@/lib/ai/models";
import { generateWithFallback } from "@/lib/ai/providers";

// Au-delà, le cours est découpé en parties (environ 8 000 tokens de cours par partie)
const SINGLE_PART_MAX = 40_000;
const PART_TARGET = 30_000;

type ChunkRow = { id: string; document_id: string; section: string | null; content: string };

/** Regroupe les morceaux en parties, en coupant de préférence à un changement de section. */
function groupIntoParts(chunks: ChunkRow[]): ChunkRow[][] {
  const total = chunks.reduce((n, c) => n + c.content.length, 0);
  if (total <= SINGLE_PART_MAX) return [chunks];

  const parts: ChunkRow[][] = [];
  let current: ChunkRow[] = [];
  let size = 0;
  for (const chunk of chunks) {
    const previous = current[current.length - 1];
    const newSection = previous && chunk.section !== previous.section;
    const newDocument = previous && chunk.document_id !== previous.document_id;
    const shouldCut =
      current.length > 0 &&
      ((size >= PART_TARGET && newSection) ||
        (size >= PART_TARGET / 2 && newDocument) ||
        size >= PART_TARGET * 1.5);
    if (shouldCut) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(chunk);
    size += chunk.content.length;
  }
  if (current.length) {
    // Évite une dernière partie minuscule
    const last = parts[parts.length - 1];
    if (last && size < PART_TARGET / 4) last.push(...current);
    else parts.push(current);
  }
  return parts;
}

function sectionsOf(part: ChunkRow[]) {
  return [...new Set(part.map((c) => c.section).filter((s): s is string => !!s))];
}

/** Titres courts générés par l'IA à partir des titres de sections ; repli sur la première section. */
async function titleParts(parts: ChunkRow[][]): Promise<string[]> {
  const fallback = parts.map((p, i) => sectionsOf(p)[0] ?? `Partie ${i + 1}`);
  try {
    const outline = parts
      .map((p, i) => `Partie ${i + 1} : ${sectionsOf(p).slice(0, 15).join(" | ") || p[0].content.slice(0, 200)}`)
      .join("\n");
    const raw = await generateWithFallback(modelChain("light"), {
      system:
        'Tu donnes un titre court (3 à 8 mots), clair et en français, à chaque partie d\'un cours. Réponds en JSON : {"titles": ["...", "..."]}',
      messages: [{ role: "user", content: outline }],
      json: true,
      maxTokens: 1024,
      temperature: 0.2,
    });
    const titles = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)).titles;
    if (Array.isArray(titles) && titles.length === parts.length) {
      return titles.map((t: unknown, i: number) => (typeof t === "string" && t.trim() ? t.trim() : fallback[i]));
    }
  } catch (error) {
    console.warn("[analyse] titres IA indisponibles", error);
  }
  return fallback;
}

/**
 * Découpe le cours en parties à partir des documents de type "cours"
 * (ou de tous les documents s'il n'y a que des exercices).
 */
export async function analyzeCourse(supabase: SupabaseClient, courseId: string) {
  const { data: documents } = await supabase
    .from("documents")
    .select("id, kind, created_at")
    .eq("course_id", courseId)
    .eq("status", "ready")
    .order("created_at");
  if (!documents?.length) throw new Error("Aucun document prêt.");

  const coursIds = documents.filter((d) => d.kind === "cours").map((d) => d.id);
  const ids = coursIds.length ? coursIds : documents.map((d) => d.id);

  const { data: chunks, error } = await supabase
    .from("chunks")
    .select("id, document_id, section, content, ordinal")
    .in("document_id", ids)
    .order("ordinal");
  if (error) throw error;
  const docOrder = new Map(ids.map((id, i) => [id, i]));
  const ordered = (chunks ?? []).sort(
    (a, b) => docOrder.get(a.document_id)! - docOrder.get(b.document_id)! || a.ordinal - b.ordinal,
  );

  const parts = groupIntoParts(ordered);
  const titles = parts.length === 1 ? ["Cours complet"] : await titleParts(parts);

  // Nouvelle analyse : les anciennes parties sont remplacées (les messages déjà générés restent)
  await supabase.from("course_parts").delete().eq("course_id", courseId);
  const { data: inserted, error: insertError } = await supabase
    .from("course_parts")
    .insert(parts.map((p, i) => ({ course_id: courseId, ordinal: i, title: titles[i], chunk_ids: p.map((c) => c.id) })))
    .select("id, ordinal, title");
  if (insertError) throw insertError;
  await supabase.from("courses").update({ analyzed_at: new Date().toISOString() }).eq("id", courseId);
  return inserted!.sort((a, b) => a.ordinal - b.ordinal);
}

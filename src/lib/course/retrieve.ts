import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "@/lib/ai/gemini";
import type { SourceChunk } from "./sources";

// Un extrait nettement moins proche de la question que le meilleur n'apporte que du bruit
const SIMILARITY_MARGIN = 0.12;

/** Extraits du cours les plus proches d'un texte (RAG), sans ceux nettement moins pertinents que le meilleur. */
export async function searchCourse(supabase: SupabaseClient, courseId: string, text: string, max: number) {
  const [query] = await embed([text], "RETRIEVAL_QUERY");
  const { data: matches, error } = await supabase.rpc("match_chunks", {
    p_course_id: courseId,
    p_query_embedding: JSON.stringify(query),
    p_match_count: max,
  });
  if (error) throw error;
  const found = (matches ?? []) as (SourceChunk & { similarity: number })[];
  const best = found[0]?.similarity ?? 0;
  return found.filter((c) => c.similarity >= best - SIMILARITY_MARGIN) as SourceChunk[];
}

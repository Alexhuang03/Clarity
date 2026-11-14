import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseWebSources, WebSource } from "./types";

/**
 * Sources web d'un cours du mode professeur, lues avec le client de l'utilisateur (RLS : propriétaire seulement).
 * null = cours ordinaire (fichiers importés), ou cours d'un autre utilisateur.
 */
export async function getCourseWebSources(supabase: SupabaseClient, courseId: string): Promise<CourseWebSources | null> {
  const [{ data: web }, { data: sources }] = await Promise.all([
    supabase.from("course_web").select("grounded, provider, search_entry_point_html").eq("course_id", courseId).maybeSingle(),
    supabase.from("course_web_sources").select("n, title, url, domain").eq("course_id", courseId).order("n"),
  ]);
  if (!web) return null;
  const provider = web.provider === "google" || web.provider === "wikipedia" ? web.provider : "none";
  return {
    origin: "web",
    grounded: !!web.grounded,
    provider,
    sources: (sources ?? []).map((s) => ({ n: s.n, title: s.title, url: s.url, domain: s.domain }) as WebSource),
    searchEntryPointHtml: typeof web.search_entry_point_html === "string" ? web.search_entry_point_html : null,
  };
}

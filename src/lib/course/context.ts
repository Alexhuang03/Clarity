import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Level } from "./prompts";
import type { DocumentInfo } from "./sources";

/** Charge un cours de l'utilisateur connecté (RLS : null si le cours n'est pas le sien). */
export async function loadCourseContext(supabase: SupabaseClient, courseId: string) {
  const [{ data: course }, { data: documents }, { data: settings }] = await Promise.all([
    supabase.from("courses").select("id, title").eq("id", courseId).maybeSingle(),
    supabase.from("documents").select("id, filename, kind").eq("course_id", courseId).eq("status", "ready"),
    supabase.from("user_settings").select("summary_model, bubble_model, explanation_level").maybeSingle(),
  ]);
  if (!course) return null;
  return {
    course,
    documents: (documents ?? []) as DocumentInfo[],
    level: (settings?.explanation_level ?? "debutant") as Level,
    summaryModel: settings?.summary_model ?? null,
    chatModel: settings?.bubble_model ?? null,
  };
}

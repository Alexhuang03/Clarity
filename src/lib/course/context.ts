import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestLocale } from "./language";
import type { Level } from "./prompts";
import type { DocumentInfo } from "./sources";
import { isSummaryDetail, type SummaryDetail } from "./summarize-config";

/** Charge un cours de l'utilisateur connecté (RLS : null si le cours n'est pas le sien). */
export async function loadCourseContext(supabase: SupabaseClient, courseId: string) {
  const [{ data: course }, { data: documents }, { data: settings }] = await Promise.all([
    supabase.from("courses").select("id, title").eq("id", courseId).maybeSingle(),
    supabase.from("documents").select("id, filename, kind").eq("course_id", courseId).eq("status", "ready"),
    // Toutes les colonnes : un réglage ajouté par une migration pas encore appliquée vaut simplement « absent »
    supabase.from("user_settings").select("*").maybeSingle(),
  ]);
  if (!course) return null;
  return {
    course,
    documents: (documents ?? []) as DocumentInfo[],
    level: (settings?.explanation_level ?? "debutant") as Level,
    summaryModel: (settings?.summary_model as string | null | undefined) ?? null,
    chatModel: (settings?.bubble_model as string | null | undefined) ?? null,
    /** Niveau de détail des résumés (réglage), « détaillé » par défaut */
    summaryDetail: (isSummaryDetail(settings?.summary_detail) ? settings.summary_detail : "detaille") as SummaryDetail,
    /** Langue des réponses de l'IA */
    locale: await requestLocale(settings?.locale),
  };
}

"use server";

import { getCurrentUser } from "@/lib/auth";
import { isSummaryDetail } from "@/lib/course/summarize-config";
import { createClient } from "@/lib/supabase/server";

/** Niveau de détail des résumés : « concis », « detaille » (défaut) ou « tres_detaille ». */
export async function setSummaryDetail(detail: unknown): Promise<{ error?: string }> {
  if (!isSummaryDetail(detail)) return { error: "Niveau de détail inconnu." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, summary_detail: detail, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("[résumé] réglage non enregistré", error.message);
    return { error: "Réglage non enregistré. Réessaie." };
  }
  return {};
}

"use server";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { customEmoteRef, type PingAction, type PingId } from "@/lib/annotations/lol";
import { normalizePings, normalizeVolume, normalizeWheel, prefsFromRows, CUSTOM_EMOTE_COLUMNS, type CustomEmoteRow } from "@/lib/annotations/prefs";

type Patch = {
  pings?: Record<PingAction, PingId>;
  wheel?: string[];
  volume?: number;
  muted?: boolean;
};

/** Enregistre une partie des réglages de pings, d'émotes ou de son (les valeurs invalides sont corrigées). */
export async function saveLolPrefs(patch: Patch): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (patch.pings !== undefined) row.ping_map = normalizePings(patch.pings);
  if (patch.wheel !== undefined) {
    const { data: emotes } = await supabase.from("custom_emotes").select(CUSTOM_EMOTE_COLUMNS);
    row.emote_wheel = normalizeWheel(patch.wheel, prefsFromRows(null, emotes as CustomEmoteRow[]).customEmotes);
  }
  if (patch.volume !== undefined) row.sound_volume = normalizeVolume(patch.volume);
  if (patch.muted !== undefined) row.sound_muted = patch.muted === true;

  const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("Réglages lolPing non enregistrés", error.message);
    return { error: "Réglage non enregistré. Réessaie." };
  }
  return {};
}

/**
 * Supprime une émote importée, ses fichiers et les réactions posées avec elle.
 * Sa case dans la roue reprend une émote par défaut.
 */
export async function deleteCustomEmote(id: string): Promise<{ error?: string; removedReactions?: number }> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: emote } = await supabase.from("custom_emotes").select("id, image_path, sound_path").eq("id", id).maybeSingle();
  if (!emote) return { error: "Émote introuvable." };

  const ref = customEmoteRef(emote.id);
  const { count } = await supabase.from("annotations").delete({ count: "exact" }).eq("kind", "reaction").eq("emote", ref);
  const { error } = await supabase.from("custom_emotes").delete().eq("id", emote.id);
  if (error) return { error: "Suppression impossible. Réessaie." };
  await supabase.storage.from("emotes").remove([emote.image_path, ...(emote.sound_path ? [emote.sound_path] : [])]);

  // La roue ne doit plus pointer vers l'émote supprimée
  const { data: settings } = await supabase.from("user_settings").select("emote_wheel").maybeSingle();
  if (Array.isArray(settings?.emote_wheel) && settings.emote_wheel.includes(ref)) {
    const { data: emotes } = await supabase.from("custom_emotes").select(CUSTOM_EMOTE_COLUMNS);
    const wheel = normalizeWheel(settings.emote_wheel, prefsFromRows(null, emotes as CustomEmoteRow[]).customEmotes);
    await supabase.from("user_settings").update({ emote_wheel: wheel }).eq("user_id", user.id);
  }
  return { removedReactions: count ?? 0 };
}

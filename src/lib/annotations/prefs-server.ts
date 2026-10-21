import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { CUSTOM_EMOTE_COLUMNS, SETTINGS_COLUMNS, prefsFromRows, type CustomEmoteRow, type LolPrefs, type SettingsRow } from "./prefs";

/** Préférences de pings, d'émotes et de son de l'utilisateur connecté (valeurs par défaut sinon). */
export async function loadLolPrefs(supabase: Awaited<ReturnType<typeof createClient>>): Promise<LolPrefs> {
  const [{ data: settings }, { data: emotes }] = await Promise.all([
    supabase.from("user_settings").select(SETTINGS_COLUMNS).maybeSingle(),
    supabase.from("custom_emotes").select(CUSTOM_EMOTE_COLUMNS).order("created_at"),
  ]);
  return prefsFromRows(settings as SettingsRow, emotes as CustomEmoteRow[] | null);
}

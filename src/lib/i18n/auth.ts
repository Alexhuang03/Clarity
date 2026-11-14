import type { AuthError } from "@supabase/supabase-js";
import type { Dictionary } from "./dictionaries";

/** Erreur Supabase Auth → message dans la langue de l'interface (même logique que lib/auth-errors.ts). */
export function authErrorText(error: AuthError | null | undefined, t: Dictionary): string {
  if (!error) return "";
  const messages = t.auth.errors;
  if (error.code && messages[error.code]) return messages[error.code];
  if (error.status === 429) return messages.over_request_rate_limit;
  if (error.message?.toLowerCase().includes("sending")) return messages.sending;
  return t.common.genericError;
}

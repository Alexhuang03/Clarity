import type { AuthError } from "@supabase/supabase-js";

// Traduit les erreurs Supabase Auth en messages compréhensibles.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  email_not_confirmed: "Ton adresse email n'est pas encore vérifiée.",
  user_already_exists: "Un compte existe déjà avec cet email.",
  email_exists: "Un compte existe déjà avec cet email.",
  weak_password: "Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  otp_expired: "Code invalide ou expiré. Demande un nouveau code.",
  email_address_invalid: "Adresse email invalide.",
  over_email_send_rate_limit: "Trop d'emails envoyés. Réessaie dans une minute.",
  over_request_rate_limit: "Trop de tentatives. Réessaie dans quelques minutes.",
  signup_disabled: "Les inscriptions sont désactivées.",
  user_not_found: "Aucun compte avec cet email.",
};

export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) return "";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  if (error.message?.toLowerCase().includes("sending")) {
    return "Impossible d'envoyer l'email pour le moment. Réessaie plus tard.";
  }
  return "Une erreur est survenue. Réessaie.";
}

// Mêmes règles que supabase/config.toml (minimum_password_length + password_requirements)
export const PASSWORD_RULES = [
  { label: "8 caractères minimum", test: (p: string) => p.length >= 8 },
  { label: "Au moins une lettre", test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "Au moins un chiffre", test: (p: string) => /\d/.test(p) },
];

export function isPasswordValid(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

// Empêche les redirections vers un autre site après connexion (?next=https://...)
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

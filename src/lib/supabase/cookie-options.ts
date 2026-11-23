// Cookies de session : attribut Secure dès que le site est en HTTPS (jamais envoyés en clair).
// En local (http://127.0.0.1), Secure empêcherait la connexion : il reste désactivé.
export const AUTH_COOKIE_OPTIONS = {
  secure: (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").startsWith("https://"),
};

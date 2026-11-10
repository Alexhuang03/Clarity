// Redirections après connexion (?next=...) : uniquement vers une page de ce site.
// Utilisable côté navigateur et côté serveur.

/**
 * Chemin interne sûr, ou "/" sinon. Refuse les adresses absolues (https://…), les adresses
 * « sans protocole » (//site, /\site : les navigateurs lisent \ comme /), et les caractères de contrôle.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "http://clarity.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

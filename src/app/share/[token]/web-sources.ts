import type { CourseWebSources, WebSource } from "@/lib/teach/types";

const PROVIDERS = new Set(["google", "wikipedia", "none"]);
const MAX_SOURCES = 500;
const MAX_HTML = 65536;

const str = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null;

/** Adresse http(s) valide, sinon null (javascript:, data:, adresse mal formée...). */
function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Clé « web » renvoyée par get_shared_course (page publique) : vérifiée champ par champ avant
 * d'être affichée. null = cours importé, ou forme inattendue. Une source invalide (URL non http(s),
 * titre ou numéro absent) est ignorée ; les autres restent affichées, triées par numéro, sans doublon.
 */
export function parseSharedWebSources(raw: unknown): CourseWebSources | null {
  if (!raw || typeof raw !== "object") return null;
  const web = raw as Record<string, unknown>;
  if (web.origin !== "web") return null;

  const seen = new Set<number>();
  const sources: WebSource[] = [];
  for (const item of Array.isArray(web.sources) ? web.sources.slice(0, MAX_SOURCES) : []) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const n = s.n;
    const url = httpUrl(s.url);
    const title = str(s.title, 300);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_SOURCES || seen.has(n) || !url || !title) continue;
    seen.add(n);
    sources.push({ n, title, url: url.href, domain: str(s.domain, 255) ?? url.hostname });
  }
  sources.sort((a, b) => a.n - b.n);

  const html = typeof web.searchEntryPointHtml === "string" && web.searchEntryPointHtml.length <= MAX_HTML ? web.searchEntryPointHtml : null;
  return {
    origin: "web",
    grounded: web.grounded === true,
    provider: PROVIDERS.has(web.provider as string) ? (web.provider as CourseWebSources["provider"]) : "none",
    sources,
    searchEntryPointHtml: html && html.trim() ? html : null,
  };
}

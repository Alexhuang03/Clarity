// Sources web d'un cours du mode professeur et citations [1], [2]... dans le texte.
// Pendant la rédaction, chaque citation est un marqueur interne ⟦c:id⟧ (id = source enregistrée) ;
// à la fin, les sources réellement citées sont numérotées dans l'ordre d'apparition (liste unifiée).

import type { WebSource } from "./types";

export const SOURCE_TITLE_MAX = 200;
export const SOURCE_URL_MAX = 2048;
const MAX_SOURCES = 60;

const MARK = /\u27e6c:(\d+)\u27e7/g;
export const citeMark = (id: number) => `\u27e6c:${id}\u27e7`;

type Registered = { id: number; title: string; url: string; domain: string };

/** Adresse acceptée : http(s) uniquement, longueur bornée, sans identifiants. null sinon. */
export function safeUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > SOURCE_URL_MAX) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || !url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

const DOMAIN_LIKE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function cleanTitle(raw: unknown): string {
  return typeof raw === "string"
    ? raw.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, SOURCE_TITLE_MAX)
    : "";
}

/**
 * Domaine affiché, calculé côté serveur. Les adresses de Google Search sont des redirections
 * (vertexaisearch.cloud.google.com) dont le titre est le plus souvent le domaine de la page d'origine.
 */
export function sourceDomain(url: URL, title: string): string {
  const t = title.toLowerCase().replace(/^www\./, "");
  if (DOMAIN_LIKE.test(t)) return t;
  return url.hostname.toLowerCase().replace(/^www\./, "").slice(0, 255);
}

/** Registre des sources rencontrées pendant la génération (dédupliquées). */
export class SourceRegistry {
  private byKey = new Map<string, Registered>();
  private byId = new Map<number, Registered>();

  /**
   * Enregistre une source, renvoie son identifiant interne (null si refusée).
   * `dedupeBy` : « title » pour Google (chaque réponse donne une nouvelle adresse de redirection
   * pour la même page, le titre est stable) ; « url » pour Wikipédia.
   */
  add(rawTitle: unknown, rawUrl: unknown, dedupeBy: "title" | "url"): number | null {
    const url = safeUrl(rawUrl);
    if (!url) return null;
    const href = url.toString();
    if (href.length > SOURCE_URL_MAX) return null;
    const title = cleanTitle(rawTitle) || url.hostname;
    const domain = sourceDomain(url, title);
    const key = dedupeBy === "title" ? `t:${title.toLowerCase()}` : `u:${href}`;
    const existing = this.byKey.get(key);
    if (existing) return existing.id;
    if (this.byId.size >= MAX_SOURCES) return null;
    const entry = { id: this.byId.size + 1, title, url: href, domain };
    this.byKey.set(key, entry);
    this.byId.set(entry.id, entry);
    return entry.id;
  }

  get(id: number) {
    return this.byId.get(id);
  }
}

/** Plages à ne jamais couper : blocs de code, code en ligne, formules LaTeX. */
function protectedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const re = /```[\s\S]*?```|\$\$[\s\S]*?\$\$|`[^`\n]+`|\$[^$\n]+\$/g;
  for (const m of text.matchAll(re)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/** Remplace dans le texte, hors code et formules. */
function replaceOutside(text: string, re: RegExp, fn: (match: string, ...groups: string[]) => string): string {
  const ranges = protectedRanges(text);
  return text.replace(re, (match: string, ...args: unknown[]) => {
    const offset = args[args.length - 2] as number;
    if (ranges.some(([s, e]) => offset >= s && offset < e)) return match;
    return fn(match, ...(args.slice(0, -2) as string[]));
  });
}

/** Retire les numéros entre crochets que le modèle aurait écrits lui-même ([3]) : seules nos citations comptent. */
export function stripModelCitations(text: string): string {
  return replaceOutside(text, / ?\[\d{1,2}\](?!\()/g, () => "");
}

/**
 * Retire tout lien du texte rédigé (hors code et formules) : images ![…](…) supprimées, liens […](…) réduits
 * à leur texte, autoliens <https://…> et adresses nues supprimés. Un lien injecté par un contenu web
 * (ou inventé par le modèle) ne peut ainsi jamais apparaître : les seules adresses du cours sont celles des sources.
 */
export function stripLinks(text: string): string {
  let out = replaceOutside(text, /!\[[^\]\n]*\]\([^)\n]*\)/g, () => "");
  out = replaceOutside(out, /\[([^\]\n]+)\]\((?:[^()\s]|\([^)\s]*\))+(?:\s+"[^"\n]*")?\)/g, (_, label) => label);
  // Liens « de référence » : [texte][id] et définitions [id]: https://…
  out = replaceOutside(out, /^\s*\[[^\]\n]+\]:\s*\S+.*$/gm, () => "");
  out = replaceOutside(out, /<(?:https?|ftp|mailto|javascript|data):[^>\s]*>/gi, () => "");
  out = replaceOutside(out, /\b(?:https?|ftp):\/\/[^\s)\]>]+|\bwww\.[a-z0-9-]+\.[^\s)\]>]+/gi, () => "");
  return out;
}

/**
 * Citations écrites par le modèle à partir d'une liste numérotée fournie (secours Wikipédia) :
 * [2], [1][3], [1, 3] → marqueurs internes. Un numéro seul inexistant (inventé) est retiré.
 * `ids[k - 1]` = identifiant interne de la source numérotée k dans la consigne.
 */
export function convertModelCitations(text: string, ids: (number | null)[]): string {
  return replaceOutside(text, /\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\](?!\()/g, (match, list) => {
    const nums = list.split(/[,;]/).map((n) => Number(n.trim()));
    const valid = nums.every((n) => n >= 1 && n <= ids.length && ids[n - 1] != null);
    if (valid) return nums.map((n) => citeMark(ids[n - 1]!)).join("");
    return nums.length === 1 && nums[0] > ids.length ? "" : match;
  });
}

type GroundingSupport = { segment?: { startIndex?: number; endIndex?: number; text?: string }; groundingChunkIndices?: number[] };

/**
 * Google Search grounding : ajoute les citations après chaque passage appuyé par des résultats de recherche.
 * Les positions de Gemini sont en octets UTF-8 : on les convertit, et on vérifie avec le texte du passage
 * (repli : recherche du passage dans le texte).
 */
export function insertGroundingCitations(text: string, supports: GroundingSupport[], chunkIds: (number | null)[]): string {
  const bytes = Buffer.from(text, "utf8");
  const charAt = (byteOffset: number) => bytes.subarray(0, byteOffset).toString("utf8").length;
  const ranges = protectedRanges(text);
  const inserts = new Map<number, Set<number>>();
  let cursor = 0;

  for (const support of supports) {
    const ids = (support.groundingChunkIndices ?? [])
      .map((i) => (Number.isInteger(i) && i >= 0 && i < chunkIds.length ? chunkIds[i] : null))
      .filter((id): id is number => id != null);
    const segText = support.segment?.text?.trim();
    if (!ids.length || !segText) continue;

    let end = -1;
    const endByte = support.segment?.endIndex;
    if (typeof endByte === "number" && endByte > 0 && endByte <= bytes.length) {
      const startByte = support.segment?.startIndex ?? 0;
      const candidate = bytes.subarray(startByte, endByte).toString("utf8").trim();
      if (candidate === segText) end = charAt(endByte);
    }
    if (end < 0) {
      let at = text.indexOf(segText, cursor);
      if (at < 0) at = text.indexOf(segText);
      if (at < 0) continue;
      end = at + segText.length;
    }
    cursor = end;
    // Jamais au milieu d'une formule ou d'un bloc de code : après
    for (const [s, e] of ranges) if (end > s && end < e) end = e;
    const set = inserts.get(end) ?? new Set<number>();
    ids.forEach((id) => set.add(id));
    inserts.set(end, set);
  }

  let out = text;
  for (const pos of [...inserts.keys()].sort((a, b) => b - a)) {
    const marks = [...inserts.get(pos)!].map(citeMark).join("");
    out = out.slice(0, pos) + marks + out.slice(pos);
  }
  return out;
}

/**
 * Citations clairsemées, sans se fier à la consigne du modèle (le texte de Google en met une par phrase) :
 * 1. dans un paragraphe, une source n'est citée qu'une fois : à sa DERNIÈRE occurrence (fin de ce qu'elle appuie) ;
 *    une liste à puces sans ligne vide compte comme un seul paragraphe ;
 * 2. dans une section (titre ## ou ###, soit une notion), une source n'est citée qu'une fois : à sa PREMIÈRE
 *    occurrence restante (en général l'idée centrale ou la définition) ;
 * 3. les répétitions collées ([1][1]) disparaissent.
 */
export function thinCitations(text: string): string {
  const dropMarks = (block: string, keep: (id: string, at: number) => boolean) =>
    block.replace(/ ?⟦c:(\d+)⟧/g, (match, id: string, offset: number) =>
      keep(id, offset + match.indexOf("⟦")) ? match : "",
    );
  return text
    .split(/(?=^#{2,3} )/m)
    .map((section) => {
      const paragraphs = section.split(/(\n[ \t]*\n)/).map((block) => {
        const last = new Map<string, number>();
        for (const m of block.matchAll(MARK)) last.set(m[1], m.index);
        return dropMarks(block, (id, at) => last.get(id) === at);
      });
      const seen = new Set<string>();
      return dropMarks(paragraphs.join(""), (id) => !seen.has(id) && !!seen.add(id));
    })
    .join("");
}

/**
 * Numérotation finale : les sources citées reçoivent 1, 2, 3... dans l'ordre d'apparition dans le cours.
 * Renvoie le texte de chaque chapitre avec [n], le même texte sans citation (pour les morceaux de recherche)
 * et la liste des sources.
 */
export function finalizeWebCitations(rawChapters: string[], registry: SourceRegistry) {
  const chapters = rawChapters.map(thinCitations);
  const numbers = new Map<number, number>();
  const sources: WebSource[] = [];
  for (const text of chapters) {
    for (const m of text.matchAll(MARK)) {
      const id = Number(m[1]);
      const entry = registry.get(id);
      if (!entry || numbers.has(id)) continue;
      numbers.set(id, sources.length + 1);
      sources.push({ n: sources.length + 1, title: entry.title, url: entry.url, domain: entry.domain });
    }
  }
  const cited = chapters.map((text) =>
    text
      .replace(MARK, (_, id) => (numbers.has(Number(id)) ? `[${numbers.get(Number(id))}]` : ""))
      // [2][2] → [2]
      .replace(/(\[\d+\])(?:\1)+/g, "$1"),
  );
  const plain = chapters.map((text) => text.replace(/ ?\u27e6c:\d+\u27e7/g, ""));
  return { cited, plain, sources };
}

"use client";

import "katex/dist/katex.min.css";
import { useId } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeCitations, normalizeMath, type Source } from "@/lib/course/sources";
import { CitationPill, SourcesList } from "./source-chip";

// Typographie aérée : interligne confortable, paragraphes et listes espacés,
// titres de niveau 3 marqués d'un filet de couleur.
const PROSE = [
  "prose prose-neutral max-w-none dark:prose-invert",
  "prose-p:leading-7 prose-p:my-3",
  "prose-li:my-1.5 prose-li:leading-7 prose-ul:my-3 prose-ol:my-3",
  "prose-h2:mt-0 prose-h2:mb-4 prose-h2:text-xl",
  "prose-h3:mt-8 prose-h3:mb-3 prose-h3:border-l-4 prose-h3:border-indigo-500 prose-h3:pl-3 prose-h3:text-lg",
  "prose-strong:font-semibold",
  "prose-blockquote:not-italic prose-blockquote:rounded-r-lg prose-blockquote:border-indigo-400 prose-blockquote:bg-indigo-500/5 prose-blockquote:py-1",
  "prose-pre:overflow-x-auto prose-hr:my-6",
  // Pas de marge parasite en haut ni en bas d'une carte
  "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
  // Mobile : retrait des listes réduit pour garder une largeur de lecture confortable
  "prose-ul:pl-5 prose-ol:pl-5 sm:prose-ul:pl-6 sm:prose-ol:pl-6 [&_li_ul]:pl-4 [&_li_ol]:pl-4",
].join(" ");

type Segment = { type: "markdown" | "corrige"; text: string };

/** Sépare les blocs :::corrige ... ::: (affichés repliés) du reste du texte. */
function splitCorriges(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /^:::corrige[^\n]*\n([\s\S]*?)(?:^:::\s*$|$(?![\s\S]))/gm;
  let last = 0;
  for (const match of content.matchAll(pattern)) {
    if (match.index > last) segments.push({ type: "markdown", text: content.slice(last, match.index) });
    segments.push({ type: "corrige", text: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) segments.push({ type: "markdown", text: content.slice(last) });
  return segments;
}

/** Découpe un résumé en grandes parties (titres ##). Les séparateurs --- deviennent inutiles. */
function splitSections(content: string): string[] {
  const sections = content.split(/^(?=## )/m).map((s) => s.replace(/^\s*-{3,}\s*$/gm, "").trim());
  return sections.filter(Boolean);
}

/** Numérotation des sources dans l'ordre où elles apparaissent (1, 2, 3...), quel que soit leur n. */
function citationNumbers(content: string, sources: Source[]) {
  const known = new Map(sources.map((s) => [s.n, s]));
  const order = new Map<number, number>();
  for (const match of content.matchAll(/\[S(\d+)\]/g)) {
    const n = Number(match[1]);
    if (known.has(n) && !order.has(n)) order.set(n, order.size + 1);
  }
  return {
    numberOf: (n: number) => order.get(n),
    cited: [...order.entries()].map(([n, number]) => ({ source: known.get(n)!, number })),
  };
}

// [S3] devient un lien interne "#src-3", rendu ensuite comme une pastille de source
const withCitationLinks = (text: string) => text.replace(/\[S(\d+)\]/g, "[S$1](#src-$1)");

const HEADING_LINE = /^#{2,3}\s+/;

/** Titres ## et ### du texte, dans l'ordre d'affichage. */
export function headingsOf(text: string) {
  return [...text.matchAll(/^(#{2,3})\s+(.+?)\s*#*$/gm)].map((m) => ({
    level: m[1].length,
    // Le sommaire affiche le titre sans la mise en forme Markdown
    text: m[2].replace(/\$([^$]+)\$/g, "$1").replace(/[*_`]/g, ""),
  }));
}

/** Position de départ de chaque élément : offsets([2, 0, 3], 1) = [1, 3, 3] */
function offsets(counts: number[], start: number) {
  return counts.map((_, i) => start + counts.slice(0, i).reduce((a, b) => a + b, 0));
}

type Context = {
  sources: Source[];
  numberOf: (n: number) => number | undefined;
  /** Préfixe des ids de titres (sommaire) ; absent = pas d'ids */
  idPrefix?: string;
};

/**
 * Bloc Markdown. headingBase = nombre de titres placés avant ce bloc dans le texte complet :
 * le titre n°i du texte complet reçoit l'id `${idPrefix}-${i}` (identifié par son numéro de ligne,
 * ce qui reste stable même quand React affiche deux fois un composant en développement).
 */
function MarkdownBlock({ text, ctx, headingBase }: { text: string; ctx: Context; headingBase: number }) {
  const headingLines = text.split("\n").flatMap((line, i) => (HEADING_LINE.test(line) ? [i + 1] : []));
  const headingId = (line?: number) => {
    const local = line ? headingLines.indexOf(line) : -1;
    return ctx.idPrefix && local >= 0 ? `${ctx.idPrefix}-${headingBase + local}` : undefined;
  };

  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith("#src-")) {
        const n = Number(href.slice(5));
        const source = ctx.sources.find((s) => s.n === n);
        const number = ctx.numberOf(n);
        // Pendant la génération, les sources ne sont pas encore connues : on n'affiche rien
        return source && number ? <CitationPill source={source} number={number} /> : null;
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    h2: ({ node, children }) => <h2 id={headingId(node?.position?.start.line)}>{children}</h2>,
    h3: ({ node, children }) => <h3 id={headingId(node?.position?.start.line)}>{children}</h3>,
    table({ children }) {
      return (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
      {withCitationLinks(text)}
    </ReactMarkdown>
  );
}

/** Texte découpé en blocs normaux et corrigés repliables. */
function Blocks({ text, ctx, headingBase }: { text: string; ctx: Context; headingBase: number }) {
  const segments = splitCorriges(text);
  const bases = offsets(
    segments.map((s) => headingsOf(s.text).length),
    headingBase,
  );
  return segments.map((segment, i) => {
    const segmentBase = bases[i];
    return segment.type === "corrige" ? (
      <details key={i} className="not-prose my-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
        <summary className="cursor-pointer select-none font-medium text-emerald-700 dark:text-emerald-400">
          Voir le corrigé
        </summary>
        <div className={`${PROSE} mt-3`}>
          <MarkdownBlock text={segment.text} ctx={ctx} headingBase={segmentBase} />
        </div>
      </details>
    ) : (
      <MarkdownBlock key={i} text={segment.text} ctx={ctx} headingBase={segmentBase} />
    );
  });
}

/** Id du titre n°index d'un message : le même dans le message et dans le sommaire de la page. */
export const headingAnchor = (messageId: string, index: number) => `h-${messageId}-${index}`;

/** Titres d'un résumé, avec leur id (même normalisation que l'affichage). */
export function summaryHeadings(messageId: string, content: string) {
  return headingsOf(normalizeMath(normalizeCitations(content))).map((h, i) => ({
    ...h,
    id: headingAnchor(messageId, i),
  }));
}

/**
 * Réponse de l'IA.
 * - "summary" : sommaire en tête, puis chaque grande partie (##) dans sa propre carte.
 * - "chat" : texte simple.
 * Les sources citées sont des pastilles numérotées dans l'ordre, listées en bas de la réponse.
 */
export function Markdown({
  content,
  sources = [],
  variant = "chat",
  messageId,
}: {
  content: string;
  sources?: Source[];
  variant?: "summary" | "chat";
  /** Message enregistré : ses titres reçoivent des ids stables, repris par le sommaire de la page */
  messageId?: string;
}) {
  const generatedId = `h${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const idPrefix = messageId ? `h-${messageId}` : generatedId;
  const text = normalizeMath(normalizeCitations(content));
  const { numberOf, cited } = citationNumbers(text, sources);
  const ctx: Context = { sources, numberOf, idPrefix };

  if (variant === "summary") {
    const sections = splitSections(text);
    const bases = offsets(
      sections.map((s) => headingsOf(s).length),
      0,
    );
    return (
      <div>
        <div className="space-y-5">
          {sections.map((section, i) => {
            const sectionBase = bases[i];
            return (
              <section
                key={i}
                className={`${PROSE} rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-5 sm:p-7 dark:border-white/10 dark:bg-white/[0.02] [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24`}
              >
                <Blocks text={section} ctx={ctx} headingBase={sectionBase} />
              </section>
            );
          })}
        </div>
        <SourcesList sources={cited} />
      </div>
    );
  }

  return (
    <div>
      <div className={PROSE}>
        <Blocks text={text} ctx={ctx} headingBase={0} />
      </div>
      <SourcesList sources={cited} />
    </div>
  );
}

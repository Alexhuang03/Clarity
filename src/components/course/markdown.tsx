"use client";

import "katex/dist/katex.min.css";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeCitations, normalizeMath, type Source } from "@/lib/course/sources";
import { SourceChip } from "./source-chip";

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

// [S3] devient un lien interne "#src-3", rendu ensuite comme une étiquette de source
const withCitationLinks = (text: string) => normalizeCitations(text).replace(/\[S(\d+)\]/g, "[S$1](#src-$1)");

function MarkdownBlock({ text, sources }: { text: string; sources: Source[] }) {
  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith("#src-")) {
        const source = sources.find((s) => s.n === Number(href.slice(5)));
        // Pendant la génération, les sources ne sont pas encore connues : simple repère
        return source ? (
          <SourceChip source={source} />
        ) : (
          <sup className="text-xs opacity-50">{children}</sup>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
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
      {withCitationLinks(normalizeMath(text))}
    </ReactMarkdown>
  );
}

export function Markdown({ content, sources = [] }: { content: string; sources?: Source[] }) {
  return (
    <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-h2:mt-8 prose-h3:mt-6 prose-pre:overflow-x-auto">
      {splitCorriges(content).map((segment, i) =>
        segment.type === "corrige" ? (
          <details key={i} className="my-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2">
            <summary className="cursor-pointer select-none font-medium text-emerald-700 dark:text-emerald-400">
              Voir le corrigé
            </summary>
            <MarkdownBlock text={segment.text} sources={sources} />
          </details>
        ) : (
          <MarkdownBlock key={i} text={segment.text} sources={sources} />
        ),
      )}
    </div>
  );
}

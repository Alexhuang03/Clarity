"use client";

import { createContext, use } from "react";
import type { Link, Parent, PhrasingContent, Root, Text } from "mdast";
import { useT } from "@/lib/i18n/client";
import type { CourseWebSources, WebSource } from "@/lib/teach/types";

/**
 * Sources web d'un cours rédigé en mode professeur (null pour un cours importé) : le texte du cours
 * s'en sert pour transformer ses citations [1], [2] en liens vers la liste des sources.
 */
export const WebSourcesContext = createContext<WebSource[] | null>(null);

/** Ancre de la source n dans la section « Sources » */
export const webSourceAnchor = (n: number) => `web-src-${n}`;
const CITATION_HREF = "#web-src-";

/**
 * Plugin remark : dans le texte (jamais dans les formules ni le code, qui sont d'autres nœuds),
 * [3] devient un lien interne #web-src-3, rendu ensuite comme une pastille par WebCitation.
 * Seulement pour les numéros qui existent : un « [12] » ordinaire reste du texte.
 */
export function remarkWebCitations(known: Set<number>) {
  const pattern = /\[(\d{1,3})\]/g;
  const split = (node: Text): PhrasingContent[] => {
    const out: PhrasingContent[] = [];
    let last = 0;
    for (const match of node.value.matchAll(pattern)) {
      const n = Number(match[1]);
      if (!known.has(n)) continue;
      if (match.index > last) out.push({ type: "text", value: node.value.slice(last, match.index) });
      out.push({ type: "link", url: `${CITATION_HREF}${n}`, children: [{ type: "text", value: String(n) }] } as Link);
      last = match.index + match[0].length;
    }
    if (last === 0) return [node];
    if (last < node.value.length) out.push({ type: "text", value: node.value.slice(last) });
    return out;
  };
  const walk = (parent: Parent) => {
    // Pas de lien dans un lien
    if (parent.type === "link" || parent.type === "linkReference") return;
    const children: Parent["children"] = parent.children;
    parent.children = children.flatMap((child): Parent["children"] => {
      if (child.type === "text") return split(child);
      if ("children" in child) walk(child as Parent);
      return [child];
    });
  };
  return () => (tree: Root) => walk(tree);
}

/** Lien de citation [n] produit par remarkWebCitations ? Renvoie n, sinon null. */
export function webCitationNumber(href: string | undefined) {
  return href?.startsWith(CITATION_HREF) ? Number(href.slice(CITATION_HREF.length)) : null;
}

/** Pastille [n] dans le texte : renvoie vers la source dans la section « Sources » en fin de cours. */
export function WebCitation({ n }: { n: number }) {
  const sources = use(WebSourcesContext);
  const { t } = useT();
  const source = sources?.find((s) => s.n === n);
  if (!source) return <>[{n}]</>;
  return (
    <a
      href={`#${webSourceAnchor(n)}`}
      title={`${source.title} — ${source.domain}`}
      aria-label={t.teach.citation(n, source.title)}
      data-annot-ignore
      className="mx-px inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-md border border-accent/30 bg-accent-soft px-1 align-middle text-[0.65rem] font-semibold leading-none text-accent-text no-underline transition hover:bg-accent hover:text-accent-foreground"
    >
      {n}
    </a>
  );
}

const globe = (
  <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5 shrink-0">
    <circle cx="10" cy="10" r="7.25" />
    <path strokeLinecap="round" d="M2.75 10h14.5M10 2.75c2 2.1 3 4.5 3 7.25s-1 5.15-3 7.25M10 2.75C8 4.85 7 7.25 7 10s1 5.15 3 7.25" />
  </svg>
);

/** En tête du cours : origine (web / Wikipédia) et, sans sources vérifiées, un avertissement. */
export function WebSourcesNotice({ data }: { data: CourseWebSources }) {
  const { t } = useT();
  const badge =
    data.provider === "google" ? t.teach.badgeWeb : data.provider === "wikipedia" ? t.teach.badgeWikipedia : t.teach.badgeNone;
  return (
    <div className="rise-in space-y-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-text">
          {globe}
          {badge}
        </span>
        {data.sources.length > 0 && (
          <a href={`#${webSourceAnchor(data.sources[0].n)}`} className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">
            {t.teach.sourcesTitle} ({data.sources.length}) ↓
          </a>
        )}
      </p>
      {!data.grounded && (
        <p
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} className="mt-0.5 h-4 w-4 shrink-0">
            <path strokeLinejoin="round" d="M10 3 18 17H2L10 3Z" />
            <path strokeLinecap="round" d="M10 8.5v3.5M10 14.5h.01" />
          </svg>
          {t.teach.ungrounded}
        </p>
      )}
    </div>
  );
}

/**
 * Fin du cours : liste numérotée des sources, puis les « Suggestions Google » (obligatoires avec la
 * recherche Google de Gemini). Ce HTML vient de Google : il est isolé dans une iframe sandbox sans
 * scripts ni accès à la page (jamais inséré dans le DOM du site) ; seuls ses liens s'ouvrent, dans un
 * nouvel onglet.
 */
export function WebSourcesSection({ data }: { data: CourseWebSources }) {
  const { t } = useT();
  if (data.sources.length === 0 && !data.searchEntryPointHtml) return null;
  return (
    <section data-annot-ignore aria-labelledby="web-sources-title" className="card rise-in p-5 sm:p-6">
      <h2 id="web-sources-title" className="text-xs font-semibold uppercase tracking-wider text-muted">
        {t.teach.sourcesTitle}
      </h2>
      {data.sources.length > 0 && (
        <>
          <p className="mt-1 text-sm text-muted">{t.teach.sourcesIntro}</p>
          <ol className="mt-4 space-y-1">
            {data.sources.map((source) => (
              <li key={source.n} id={webSourceAnchor(source.n)} className="scroll-mt-24 rounded-xl target:bg-accent-soft">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.teach.sourceLink(source.n, source.title)}
                  className="group flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
                >
                  <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent-soft px-1 text-[0.7rem] font-semibold text-accent-text">
                    {source.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug group-hover:underline">{source.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                      {globe}
                      <span className="truncate">{source.domain}</span>
                      <span aria-hidden>↗</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
      {data.searchEntryPointHtml && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium text-muted">{t.teach.googleSuggestions}</p>
          <iframe
            title={t.teach.googleSuggestions}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            // <base target="_blank"> : les liens s'ouvrent dans un nouvel onglet au lieu de l'iframe
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:transparent}</style></head><body>${data.searchEntryPointHtml}</body></html>`}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="block h-[4.5rem] w-full rounded-xl border-0"
          />
        </div>
      )}
    </section>
  );
}

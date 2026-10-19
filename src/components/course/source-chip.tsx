"use client";

import { useState } from "react";
import { getDocumentUrl } from "@/app/courses/actions";
import type { Source } from "@/lib/course/sources";

function sourceLabel(source: Source) {
  return `${source.filename.replace(/\.[^.]+$/, "")}${source.page ? ` · p.${source.page}` : ""}`;
}

/** Ouvre le document original, à la bonne page pour un PDF. */
async function openSource(source: Source) {
  // L'onglet est ouvert tout de suite, sinon le navigateur bloque la fenêtre après l'appel serveur
  const tab = window.open("about:blank", "_blank");
  const url = await getDocumentUrl(source.documentId);
  if (!url || !tab) return tab?.close();
  const isPdf = source.filename.toLowerCase().endsWith(".pdf");
  tab.location.href = isPdf && source.page ? `${url}#page=${source.page}` : url;
}

/** Pastille numérotée dans le texte : discrète, le détail s'affiche au survol. */
export function CitationPill({ source, number }: { source: Source; number: number }) {
  return (
    <button
      type="button"
      onClick={() => openSource(source)}
      title={`${sourceLabel(source)}${source.section ? ` — ${source.section}` : ""}\n\n${source.excerpt}…`}
      aria-label={`Source ${number} : ${sourceLabel(source)}`}
      className="mx-px inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-full bg-indigo-500/15 px-1 align-middle text-[0.65rem] font-semibold leading-none text-indigo-700 no-underline transition hover:bg-indigo-500 hover:text-white dark:text-indigo-300"
    >
      {number}
    </button>
  );
}

/** Liste des sources citées, en bas d'une réponse. */
export function SourcesList({ sources }: { sources: { source: Source; number: number }[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  const visible = open ? sources : sources.slice(0, 4);
  return (
    <div className="mt-6 border-t border-black/10 pt-4 dark:border-white/10">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">Sources</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {visible.map(({ source, number }) => (
          <li key={source.n}>
            <button
              type="button"
              onClick={() => openSource(source)}
              title={source.excerpt}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500/15 text-[0.7rem] font-semibold text-indigo-700 dark:text-indigo-300">
                {number}
              </span>
              <span aria-hidden>{source.kind === "exo" ? "✏️" : "📄"}</span>
              <span className="min-w-0 flex-1 truncate">
                {sourceLabel(source)}
                {source.section && <span className="opacity-50"> — {source.section}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sources.length > 4 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 px-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          {open ? "Voir moins" : `Voir les ${sources.length} sources`}
        </button>
      )}
    </div>
  );
}

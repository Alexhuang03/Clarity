"use client";

import { useState } from "react";
import { getDocumentUrl } from "@/app/courses/actions";
import type { Source } from "@/lib/course/sources";

/** Étiquette de source : survol = extrait, clic = ouvre le document original à la bonne page. */
export function SourceChip({ source }: { source: Source }) {
  const [opening, setOpening] = useState(false);
  const isPdf = source.filename.toLowerCase().endsWith(".pdf");
  const label = `${source.filename.replace(/\.[^.]+$/, "")}${source.page ? ` · p.${source.page}` : ""}`;

  async function open() {
    // Ouvre l'onglet tout de suite (sinon le navigateur bloque la fenêtre après l'appel serveur)
    const tab = window.open("about:blank", "_blank");
    setOpening(true);
    const url = await getDocumentUrl(source.documentId);
    setOpening(false);
    if (!url || !tab) return tab?.close();
    tab.location.href = isPdf && source.page ? `${url}#page=${source.page}` : url;
  }

  return (
    <button
      type="button"
      onClick={open}
      title={`${source.section ? `${source.section}\n\n` : ""}${source.excerpt}…`}
      className="mx-0.5 inline-flex max-w-[16rem] translate-y-[-1px] items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0 align-middle text-[0.7rem] font-medium leading-5 text-indigo-700 no-underline hover:bg-indigo-500/20 dark:text-indigo-300"
    >
      <span aria-hidden>{source.kind === "exo" ? "✏️" : "📄"}</span>
      <span className="truncate">{opening ? "Ouverture…" : label}</span>
    </button>
  );
}

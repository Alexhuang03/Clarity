"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * Réflexion du modèle, au-dessus de sa réponse.
 * Ouverte pendant qu'il réfléchit, repliée automatiquement dès que la réponse commence
 * (sauf si l'utilisateur l'a ouverte ou fermée lui-même).
 */
export function ThinkingPanel({
  text,
  live = false,
  durationMs,
}: {
  text: string;
  /** Le modèle est en train de réfléchir (la réponse n'a pas commencé) */
  live?: boolean;
  durationMs?: number | null;
}) {
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const open = userChoice ?? live;
  const body = useRef<HTMLDivElement>(null);

  // Pendant la réflexion, on suit le texte qui s'écrit
  useEffect(() => {
    if (live && open && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [text, live, open]);

  const label = live
    ? "Réflexion en cours…"
    : `Réflexion du modèle${durationMs ? ` · ${formatDuration(durationMs)}` : ""}`;

  return (
    <div className="mb-4 rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setUserChoice(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 text-indigo-500 ${live ? "animate-pulse" : ""}`}>
          <path d="M10 2a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3V15a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.9c0-.5.2-1 .6-1.3A6 6 0 0 0 10 2ZM8 17.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 0-1h-3a.5.5 0 0 0-.5.5Z" />
        </svg>
        <span className={`font-medium ${live ? "animate-pulse" : "opacity-70"}`}>{label}</span>
        <span className="ml-auto text-xs opacity-50">{open ? "Masquer" : "Afficher"}</span>
      </button>
      {open && (
        <div
          ref={body}
          className="prose prose-sm prose-neutral max-h-72 max-w-none overflow-y-auto border-t border-black/10 px-4 py-3 opacity-75 dark:prose-invert dark:border-white/10 prose-p:my-2 prose-headings:text-sm"
        >
          <p className="!mt-0 text-xs italic opacity-60">
            Raisonnement interne du modèle (souvent rédigé en anglais).
          </p>
          {/* Les repères de sources [S2] n'ont pas de sens dans la réflexion : on les retire */}
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {text.replace(/\s?\[S\d+\]/g, "")}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

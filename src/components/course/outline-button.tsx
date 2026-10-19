"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageRow, PartRow } from "@/lib/course/types";
import { CourseOutline, hasOutline } from "./course-outline";

/**
 * Bouton « Sommaire » de la barre du cours (mobile et écrans moyens) : ouvre le sommaire
 * dans un panneau à gauche. Sur très grand écran, le sommaire est déjà dans la marge.
 */
export function OutlineButton({
  messages,
  parts,
  className = "",
}: {
  messages: MessageRow[];
  parts: PartRow[];
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  if (!hasOutline(messages)) return null;

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Sommaire"
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 xl:hidden ${className}`}
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" d="M7 5h10M7 10h10M7 15h10M3.5 5h.01M3.5 10h.01M3.5 15h.01" />
        </svg>
        <span>Sommaire</span>
      </button>
      {/* Hors de la barre : son flou d'arrière-plan décalerait la fenêtre */}
      {open &&
        createPortal(
          <dialog
            ref={(node) => {
              dialogRef.current = node;
              if (node && !node.open) node.showModal();
            }}
            onClose={() => setOpen(false)}
            // Clic sur le fond : ferme le panneau
            onClick={(e) => e.target === dialogRef.current && close()}
            className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,85vw)] border-r border-black/10 bg-[var(--background)] p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] dark:border-white/10"
          >
            <div className="flex h-full flex-col">
              <div className="flex justify-end px-3 pt-3">
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fermer le sommaire"
                  className="rounded-lg px-2 py-1 opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-8">
                <CourseOutline messages={messages} parts={parts} onNavigate={close} />
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

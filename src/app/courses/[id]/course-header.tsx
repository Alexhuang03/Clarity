"use client";

import Link from "next/link";
import { useState } from "react";
import { EditCourseForm } from "@/components/course/edit-course-form";
import { ShareButton } from "@/components/course/share-dialog";
import { DeleteCourseButton } from "./delete-course-button";

const ACTION = "rounded-lg px-3 py-1.5 text-sm opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10";
const MENU_ITEM = "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10";

/**
 * Barre du cours, fixée en haut pendant le défilement : retour à l'accueil et actions
 * toujours accessibles, même au milieu d'un long résumé.
 */
export function CourseHeader({
  courseId,
  title,
  subject,
  subjects,
}: {
  courseId: string;
  title: string;
  subject: string | null;
  subjects: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[var(--background)]/85 backdrop-blur-md dark:border-white/10">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 lg:max-w-[70rem]">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
          aria-label="Retour à mes cours"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Mes cours</span>
        </Link>

        {editing ? (
          <div className="flex-1 py-2">
            <EditCourseForm
              courseId={courseId}
              title={title}
              subject={subject}
              subjects={subjects}
              onDone={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 border-l border-black/10 pl-3 dark:border-white/10">
              {subject && (
                <p className="truncate text-[0.65rem] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  {subject}
                </p>
              )}
              <h1 className="truncate text-base font-semibold sm:text-lg" title={title}>
                {title}
              </h1>
            </div>

            {/* Ordinateur : actions visibles */}
            <div className="hidden shrink-0 items-center sm:flex">
              <button type="button" onClick={() => setEditing(true)} className={ACTION}>
                Modifier
              </button>
              <ShareButton courseId={courseId} title={title} className={ACTION}>
                Partager
              </ShareButton>
              <DeleteCourseButton courseId={courseId} title={title} />
            </div>

            {/* Mobile : actions regroupées dans un menu pour garder la barre sur une ligne */}
            <div className="relative shrink-0 sm:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-label="Actions du cours"
                className="rounded-lg px-3 py-1.5 text-lg leading-none opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
              >
                ⋯
              </button>
              {/* Un clic n'importe où ailleurs ferme le menu */}
              {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />}
              {/* Le menu est seulement masqué, jamais retiré : la fenêtre « Partager » qu'il ouvre
                  appartient à son bouton et disparaîtrait avec lui */}
              <div
                className={`absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-black/10 bg-[var(--background)] p-1 shadow-lg dark:border-white/15 ${menuOpen ? "" : "hidden"}`}
                onClick={() => setMenuOpen(false)}
              >
                <button type="button" onClick={() => setEditing(true)} className={MENU_ITEM}>
                  Modifier
                </button>
                <ShareButton courseId={courseId} title={title} className={MENU_ITEM}>
                  Partager
                </ShareButton>
                <DeleteCourseButton courseId={courseId} title={title} className={`${MENU_ITEM} text-red-600 dark:text-red-400`} />
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

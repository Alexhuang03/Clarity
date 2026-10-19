"use client";

import Link from "next/link";
import { COURSE_FRAME, COURSE_MARGIN } from "@/components/course/layout";

/**
 * Barre du cours, fixée en haut pendant le défilement : retour à l'accueil et sommaire
 * toujours accessibles, même au milieu d'un long résumé. outline = bouton « Sommaire ».
 * Modifier / Partager / Supprimer se trouvent sur la carte du cours, à l'accueil.
 */
export function CourseHeader({
  title,
  subject,
  outline,
}: {
  title: string;
  subject: string | null;
  outline?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[var(--background)]/85 backdrop-blur-md dark:border-white/10">
      {/* Même grille que le cours : « Mes cours » au-dessus du sommaire, titre au-dessus du texte */}
      <div className={`${COURSE_FRAME} flex items-center gap-3 py-3`}>
        <Link href="/" className={`flex shrink-0 items-center ${COURSE_MARGIN}`} aria-label="Retour à mes cours">
          <span className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 xl:-ml-2">
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Mes cours</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1 border-l border-black/10 pl-3 dark:border-white/10 xl:border-0 xl:pl-0">
            {subject && (
              <p className="truncate text-[0.65rem] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                {subject}
              </p>
            )}
            <h1 className="truncate text-base font-semibold sm:text-lg" title={title}>
              {title}
            </h1>
          </div>
          {outline}
        </div>
      </div>
    </header>
  );
}

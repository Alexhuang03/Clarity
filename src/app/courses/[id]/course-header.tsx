"use client";

import Link from "next/link";
import { COURSE_FRAME, COURSE_MARGIN } from "@/components/course/layout";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useT } from "@/lib/i18n/client";

/** id de l'emplacement de la barre où d'autres composants ajoutent un bouton (portail React). */
export const COURSE_HEADER_SLOT = "course-header-actions";

/**
 * Barre du cours, fixée en haut pendant le défilement : retour à l'accueil et sommaire
 * toujours accessibles, même au milieu d'un long résumé. outline = bouton « Sommaire ».
 * Modifier / Partager / Supprimer se trouvent sur la carte du cours, à l'accueil.
 */
export function CourseHeader({
  courseId,
  title,
  subject,
  outline,
}: {
  /** Pour le lien « Réviser » (absent : pas de lien) */
  courseId?: string;
  title: string;
  subject: string | null;
  outline?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      {/* Même grille que le cours : « Mes cours » au-dessus du sommaire, titre au-dessus du texte */}
      <div className={`${COURSE_FRAME} flex items-center gap-3 py-3`}>
        <Link
          href="/"
          transitionTypes={["nav-back"]}
          className={`flex shrink-0 items-center ${COURSE_MARGIN}`}
          aria-label={t.course.backToCourses}
        >
          <span className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground xl:-ml-2">
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">{t.common.myCourses}</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1 border-l border-line pl-3 xl:border-0 xl:pl-0">
            {subject && (
              <p className="eyebrow truncate !text-[0.65rem]">
                {subject}
              </p>
            )}
            <h1 className="truncate text-base font-semibold sm:text-lg" title={title}>
              {title}
            </h1>
          </div>
          {/* Emplacement rempli par la couche d'annotations (bouton « 💬 N » sur mobile) */}
          <div id={COURSE_HEADER_SLOT} className="flex shrink-0 items-center empty:hidden" />
          {outline}
          {courseId && (
            <Link
              href={`/courses/${courseId}/study`}
              transitionTypes={["nav-forward"]}
              aria-label={t.course.reviseLabel}
              title={t.course.reviseTitle}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-card transition hover:border-accent/40 hover:text-accent-text"
            >
              <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.5 10 3l7 3.5-7 3.5-7-3.5ZM6 8.2v4.3c0 1 1.8 2.5 4 2.5s4-1.5 4-2.5V8.2M17 6.5V11" />
              </svg>
              <span className="hidden sm:inline">{t.course.revise}</span>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

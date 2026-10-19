/**
 * Cadre d'une page de cours. Le texte est toujours centré dans la fenêtre :
 * - très grand écran : 3 colonnes, sommaire dans la marge de gauche, texte au centre ;
 * - sinon : une colonne centrée (le sommaire s'ouvre depuis le bouton « Sommaire » de la barre).
 */
export const COURSE_FRAME =
  "mx-auto w-full max-w-[46rem] px-4 xl:grid xl:max-w-none xl:grid-cols-[minmax(0,1fr)_minmax(0,46rem)_minmax(0,1fr)] xl:gap-12 xl:px-8";

/** Élément placé dans la marge de gauche (même largeur que le sommaire). */
export const COURSE_MARGIN = "xl:w-60 xl:justify-self-end";

export function CourseColumns({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`${COURSE_FRAME} flex flex-1 flex-col`}>
      <aside className={`hidden xl:block ${COURSE_MARGIN}`}>
        {/* Défilement sans barre visible, avec un fondu en haut et en bas */}
        <div className="sticky top-20 max-h-[calc(100dvh-5rem)] overflow-y-auto pb-10 pr-2 pt-8 [mask-image:linear-gradient(to_bottom,transparent,black_2rem,black_calc(100%-3rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {aside}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Mise en page d'un cours : sur grand écran, sommaire fixe à gauche et conversation à droite.
 * Sur mobile, une seule colonne (le sommaire reste en tête de chaque résumé).
 */
export function CourseColumns({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`${COURSE_COLUMNS} flex-1 pb-4`}>
      <aside className="hidden lg:block">
        {/* Défilement sans barre visible, avec un fondu en haut et en bas */}
        <div className="sticky top-20 max-h-[calc(100dvh-5rem)] overflow-y-auto pb-10 pr-4 pt-8 [mask-image:linear-gradient(to_bottom,transparent,black_2rem,black_calc(100%-3rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {aside}
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}

/** Grille partagée avec l'en-tête du cours, pour que le titre reste aligné sur la conversation. */
export const COURSE_COLUMNS =
  "mx-auto grid w-full max-w-3xl grid-cols-1 px-4 lg:max-w-[70rem] lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12";

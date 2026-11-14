"use client";

import { useT } from "@/lib/i18n/client";
import { studyTool, type StudyToolSlug } from "./tools";

/**
 * État vide d'un outil de révision (aucun document prêt, rien de généré...). action = bouton ou lien
 * fourni par la page ; sinon un bouton inactif « Bientôt ».
 */
export function StudyEmptyState({
  slug,
  action,
  message,
}: {
  slug: StudyToolSlug;
  action?: React.ReactNode;
  /** Remplace le texte par défaut de l'outil */
  message?: string;
}) {
  const tool = studyTool(slug);
  const { t } = useT();
  const text = t.study.tools[slug];
  return (
    <section className="rise-in mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
      <div className="relative mb-6">
        {/* Halo d'accent très léger derrière l'icône */}
        <div aria-hidden className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent-soft blur-2xl" />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-accent-text shadow-card [&_svg]:h-6 [&_svg]:w-6">
          {tool.icon}
        </div>
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{text.label}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{message ?? text.empty}</p>
      <div className="mt-8">
        {action ?? (
          <button type="button" disabled className="btn btn-primary">
            {text.cta}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">
              {t.study.soon}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

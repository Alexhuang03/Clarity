/**
 * Outils de révision d'un cours : une entrée par page de src/app/courses/[id]/study/.
 * Source unique pour la navigation (onglets), le hub « Réviser » et les états vides.
 * Les textes (nom, accroche, état vide, bouton) sont dans le dictionnaire : t.study.tools[slug].
 */
export type StudyToolSlug = "quiz" | "flashcards" | "fiches" | "examen" | "test-rapide" | "mindmap";

export type StudyTool = {
  slug: StudyToolSlug;
  icon: React.ReactNode;
};

const svg = (d: React.ReactNode) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    {d}
  </svg>
);

export const STUDY_TOOLS: StudyTool[] = [
  {
    slug: "quiz",
    icon: svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14" />
        <path d="M12 17h.01" />
      </>,
    ),
  },
  {
    slug: "flashcards",
    icon: svg(
      <>
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="M7 3h11a3 3 0 0 1 3 3v9" />
      </>,
    ),
  },
  {
    slug: "fiches",
    icon: svg(
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4M9 12h7M9 16h5" />
      </>,
    ),
  },
  {
    slug: "examen",
    icon: svg(
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M10 2h4" />
      </>,
    ),
  },
  {
    slug: "test-rapide",
    icon: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />),
  },
  {
    slug: "mindmap",
    icon: svg(
      <>
        <circle cx="12" cy="12" r="2.5" />
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="m6.5 6.5 3.7 3.7M17.5 6.5l-3.7 3.7M6.5 17.5l3.7-3.7M17.5 17.5l-3.7-3.7" />
      </>,
    ),
  },
];

export const studyTool = (slug: StudyToolSlug) => STUDY_TOOLS.find((t) => t.slug === slug)!;

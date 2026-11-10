/**
 * Outils de révision d'un cours : une entrée par page de src/app/courses/[id]/study/.
 * Source unique pour la navigation (onglets), le hub « Réviser » et les états vides.
 */
export type StudyToolSlug = "quiz" | "flashcards" | "fiches" | "examen" | "test-rapide" | "mindmap";

export type StudyTool = {
  slug: StudyToolSlug;
  label: string;
  /** Une ligne, pour le hub */
  tagline: string;
  /** Texte de l'état vide (avant la première génération) */
  empty: string;
  /** Libellé du bouton principal */
  cta: string;
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
    label: "Quiz",
    tagline: "Des QCM corrigés et expliqués, partie par partie.",
    empty: "Aucun quiz pour l'instant. Génère des questions à partir de ton cours : chaque réponse est corrigée et expliquée.",
    cta: "Générer un quiz",
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
    label: "Flashcards",
    tagline: "Répétition espacée : revois chaque carte au bon moment.",
    empty: "Pas encore de cartes. Crée un paquet à partir du cours : les cartes reviennent quand tu es sur le point de les oublier.",
    cta: "Créer des flashcards",
    icon: svg(
      <>
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="M7 3h11a3 3 0 0 1 3 3v9" />
      </>,
    ),
  },
  {
    slug: "fiches",
    label: "Fiches",
    tagline: "L'essentiel du cours sur une page : définitions, formules, pièges.",
    empty: "Aucune fiche de révision. Génère une fiche synthétique, prête à relire la veille de l'examen.",
    cta: "Générer une fiche",
    icon: svg(
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4M9 12h7M9 16h5" />
      </>,
    ),
  },
  {
    slug: "examen",
    label: "Examen blanc",
    tagline: "Un sujet complet, chronométré, noté comme le jour J.",
    empty: "Pas encore d'examen blanc. Lance un sujet complet en temps limité, puis découvre ta note et la correction.",
    cta: "Lancer un examen blanc",
    icon: svg(
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M10 2h4" />
      </>,
    ),
  },
  {
    slug: "test-rapide",
    label: "Test rapide",
    tagline: "Cinq questions, deux minutes : idéal entre deux cours.",
    empty: "Fais le point en deux minutes : cinq questions tirées au hasard dans tout le cours.",
    cta: "Commencer un test",
    icon: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />),
  },
  {
    slug: "mindmap",
    label: "Carte mentale",
    tagline: "Les notions du cours et leurs liens, d'un coup d'œil.",
    empty: "Aucune carte mentale. Visualise les grandes notions du cours et la façon dont elles s'articulent.",
    cta: "Générer la carte",
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

// Contrat de l'API « révision » (quiz, flashcards, fiches, cartes mentales, progression).
// Types partagés entre le serveur et l'interface : aucun import serveur ici.
import type { Source } from "@/lib/course/sources";

export type { Source };

/** Erreur renvoyée par toutes les routes (statut HTTP 4xx/5xx). */
export type ApiError = { error: string };

// ------------------------------------------------------------------ Périmètre

/**
 * Partie du cours sur laquelle porte une génération. Vide ou absent = tout le cours.
 * partIds et documentIds se cumulent (union).
 */
export type StudyScope = { partIds?: string[]; documentIds?: string[] };

// ------------------------------------------------------------------ Questions

export type Difficulty = "facile" | "moyen" | "difficile";

/** single = QCM une réponse, multiple = QCM plusieurs réponses, truefalse = vrai/faux,
 *  short = réponse courte (corrigée par l'IA), open = question ouverte (examen blanc, barème). */
export type QuestionType = "single" | "multiple" | "truefalse" | "short" | "open";

export type RubricCriterion = { criterion: string; points: number };

type QuestionBase = {
  /** "q1", "q2"... unique dans le quiz */
  id: string;
  prompt: string;
  /** Notion évaluée (sert au suivi de la maîtrise) */
  concept: string;
  difficulty: Difficulty;
  points: number;
};

/** Question telle qu'envoyée AVANT la remise : aucune réponse, explication ni source. */
export type PublicQuestion =
  | (QuestionBase & { type: "single" | "multiple"; choices: string[] })
  | (QuestionBase & { type: "truefalse" | "short" | "open" });

/** Question complète (révélée dans le résultat d'une tentative remise). */
export type Question =
  | (QuestionBase & { type: "single"; choices: string[]; answer: number; explanation: string; sources: Source[] })
  | (QuestionBase & { type: "multiple"; choices: string[]; answers: number[]; explanation: string; sources: Source[] })
  | (QuestionBase & { type: "truefalse"; answer: boolean; explanation: string; sources: Source[] })
  | (QuestionBase & { type: "short"; expected: string; explanation: string; sources: Source[] })
  | (QuestionBase & {
      type: "open";
      expected: string;
      rubric: RubricCriterion[];
      explanation: string;
      sources: Source[];
    });

/**
 * Réponse de l'élève à une question :
 * single → index du choix ; multiple → indices ; truefalse → booléen ; short/open → texte ; null = sans réponse.
 */
export type AnswerValue = number | number[] | boolean | string | null;
export type Answers = Record<string, AnswerValue>;

// ------------------------------------------------------------------ Quiz / examen / test rapide

export type QuizMode = "quiz" | "exam" | "quick";

export type QuizConfig = {
  count: number;
  difficulty: Difficulty | "mixte";
  types: QuestionType[];
  scope: StudyScope;
  /** Test rapide : notions faibles visées (vide si aucune donnée de progression) */
  targetConcepts?: string[];
};

/** POST /study/quizzes — corps, selon le mode. */
export type CreateQuizRequest =
  | {
      mode: "quiz";
      /** 3 à 30, défaut 10 */
      count?: number;
      /** défaut "mixte" */
      difficulty?: Difficulty | "mixte";
      /** sous-ensemble de single | multiple | truefalse | short ; défaut les quatre */
      types?: Exclude<QuestionType, "open">[];
      scope?: StudyScope;
    }
  | {
      mode: "exam";
      /** 5 à 240 minutes, défaut 60 */
      durationMinutes?: number;
      /** 4 à 25, défaut 10 (dont environ un tiers de questions ouvertes) */
      count?: number;
      difficulty?: Difficulty | "mixte";
      scope?: StudyScope;
    }
  | {
      mode: "quick";
      /** défaut true : vise les notions les plus faibles s'il existe des données de progression */
      targetWeak?: boolean;
      scope?: StudyScope;
    };

export type AttemptSummary = {
  id: string;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  /** 0 à 100, null si pas encore remise */
  percent: number | null;
  late: boolean;
};

export type QuizSummary = {
  id: string;
  mode: QuizMode;
  title: string;
  questionCount: number;
  timeLimitSec: number | null;
  createdAt: string;
  attemptCount: number;
  bestPercent: number | null;
  lastPercent: number | null;
  /** Dernière tentative commencée et pas encore corrigée (à reprendre), null sinon */
  inProgress: AttemptSummary | null;
};

/** Quiz sans les réponses. */
export type PublicQuiz = {
  id: string;
  courseId: string;
  mode: QuizMode;
  title: string;
  config: QuizConfig;
  timeLimitSec: number | null;
  questions: PublicQuestion[];
  createdAt: string;
};

/** POST /study/quizzes — réponse : le quiz et une première tentative déjà démarrée. */
export type CreateQuizResponse = { quiz: PublicQuiz; attempt: AttemptSummary };

/** GET /study/quizzes/[quizId] */
export type QuizDetailResponse = { quiz: PublicQuiz; attempts: AttemptSummary[] };

export type QuestionResult = {
  questionId: string;
  /** "partial" : une partie des points (QCM multiple, réponse courte, question ouverte) */
  status: "correct" | "partial" | "incorrect" | "unanswered";
  score: number;
  maxScore: number;
  given: AnswerValue;
  /** Retour personnalisé (réponses courtes et questions ouvertes corrigées par l'IA) */
  feedback: string | null;
  /** Question ouverte : points obtenus par critère du barème */
  rubricScores?: { criterion: string; points: number; maxPoints: number }[];
};

/** Tentative remise : correction complète, questions révélées. */
export type AttemptResult = AttemptSummary & {
  quizId: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  percent: number;
  /** Appréciation générale (examen blanc / quiz) */
  feedback: string | null;
  results: QuestionResult[];
  questions: Question[];
};

/** POST /study/quizzes/[quizId]/attempts/[attemptId] — corps. */
export type SubmitAttemptRequest = { answers: Answers };

/** GET ou POST /study/quizzes/[quizId]/attempts/[attemptId] — réponse. */
/** PATCH d'une tentative en cours : enregistre le brouillon des réponses (reprise sur un autre appareil). */
export type SaveDraftRequest = { answers: Answers };

export type AttemptResponse =
  /** answers : brouillon enregistré (PATCH), ou réponses déjà envoyées si la correction est à relancer */
  | { status: "in_progress"; attempt: AttemptSummary; answers: Answers }
  | { status: "submitted"; attempt: AttemptResult };

// ------------------------------------------------------------------ Flashcards

export type Rating = "again" | "hard" | "good" | "easy";

export type Flashcard = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  concept: string | null;
  sources: Source[];
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeckSummary = {
  id: string;
  title: string;
  createdAt: string;
  cardCount: number;
  /** Cartes non suspendues dont l'échéance est passée */
  dueCount: number;
  /** Cartes jamais révisées */
  newCount: number;
};

/** POST /study/decks — corps. empty: true crée un paquet vide (sans IA). */
export type CreateDeckRequest = {
  title?: string;
  /** 5 à 50, défaut 20 */
  count?: number;
  scope?: StudyScope;
  empty?: boolean;
};
export type DeckResponse = { deck: DeckSummary; cards: Flashcard[] };

export type UpdateDeckRequest = { title: string };

export type CreateCardRequest = { front: string; back: string; concept?: string | null };
export type UpdateCardRequest = { front?: string; back?: string; concept?: string | null; suspended?: boolean };
export type CardResponse = { card: Flashcard };

export type ReviewRequest = { rating: Rating };
/** Intervalles prévus pour chaque note (aperçu sur les boutons), en jours (fractions = minutes). */
export type IntervalPreview = Record<Rating, number>;
export type ReviewResponse = { card: Flashcard; next: IntervalPreview };

/** GET /study/cards/due */
export type DueCardsResponse = { cards: (Flashcard & { preview: IntervalPreview })[]; total: number };

// ------------------------------------------------------------------ Fiches de révision

export type SheetData = {
  title: string;
  summary: string;
  keyConcepts: { term: string; explanation: string }[];
  definitions: { term: string; definition: string }[];
  /** latex sans délimiteurs (le markdown l'entoure de $...$) */
  formulas: { name: string; latex: string; explanation: string }[];
  pitfalls: string[];
  sources: Source[];
};

export type SheetSummary = { id: string; title: string; scope: StudyScope; createdAt: string; updatedAt: string };
export type Sheet = SheetSummary & { data: SheetData; content: string; model: string | null };

export type CreateSheetRequest = { scope?: StudyScope; title?: string };
export type SheetResponse = { sheet: Sheet };

// ------------------------------------------------------------------ Cartes mentales

export type MindMapNode = { id: string; label: string; summary?: string; children: MindMapNode[] };

export type MindMapSummary = { id: string; title: string; scope: StudyScope; createdAt: string };
export type MindMap = MindMapSummary & { tree: MindMapNode; model: string | null };

export type CreateMindMapRequest = { scope?: StudyScope; title?: string };
export type MindMapResponse = { mindmap: MindMap };

// ------------------------------------------------------------------ Progression

export type MasteryLevel = "faible" | "moyen" | "maitrise";

export type ConceptMastery = {
  key: string;
  label: string;
  /** 0 à 1 (estimation bayésienne pondérée par la récence) */
  mastery: number;
  level: MasteryLevel;
  /** Nombre d'évaluations */
  attempts: number;
  lastSeenAt: string;
};

export type StatsResponse = {
  /** Triées de la plus faible à la mieux maîtrisée */
  concepts: ConceptMastery[];
  /** Jusqu'à 5 notions faibles (mastery < 0,6 et au moins 2 évaluations, sinon les plus faibles) */
  weakConcepts: ConceptMastery[];
  totals: {
    quizzesTaken: number;
    averagePercent: number | null;
    cardsTotal: number;
    cardsDue: number;
    reviewsLast7Days: number;
    /** Jours consécutifs d'activité (quiz remis ou carte révisée), jusqu'à aujourd'hui (UTC) */
    streakDays: number;
  };
  recentAttempts: (AttemptSummary & { quizId: string; mode: QuizMode; title: string })[];
};

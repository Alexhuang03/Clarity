# API « Révision » (quiz, examens blancs, tests rapides, flashcards, fiches, cartes mentales, progression)

Tous les types cités sont exportés par `src/lib/study/types.ts` (fichier sans dépendance serveur : importable côté client avec `import type { … } from "@/lib/study/types"`).

## Généralités

- **Base** : `/api/courses/{courseId}/study` — `courseId` = id d'un cours de l'utilisateur connecté.
- **Authentification** : cookie de session Supabase (comme le chat). Sans session → `401`.
- **Corps** : JSON (`Content-Type: application/json`), 100 Ko max. Un corps vide vaut `{}`.
- **Réponses** : toujours du JSON (pas de flux). Les générations par IA prennent **10 à 90 s** : afficher un état de chargement, ne pas relancer automatiquement.
- **Erreurs** : `{ error: string }` (type `ApiError`), message en français prêt à afficher.

| Statut | Signification |
| --- | --- |
| 400 | Requête invalide (message détaillé, ex. `Requête invalide — count : maximum 30`), sélection vide |
| 401 | Non connecté |
| 404 | Cours / quiz / tentative / paquet / carte / fiche / carte mentale introuvable (ou pas à l'utilisateur) |
| 409 | Aucun document prêt dans le cours, ou aucun texte exploitable dans la sélection |
| 413 | Corps trop volumineux |
| 429 | Limite de débit des outils d'étude atteinte (en-tête `Retry-After` en secondes) |
| 502 / 503 / 504 | IA en échec / saturée / trop lente — réessayer plus tard |
| 500 | Erreur interne |

**Limite de débit** (`RATE_LIMITS.study`) : 6 générations/min, 60/h, 200/jour par utilisateur (plus le plafond global IA). Comptent : chaque création de quiz/examen/test rapide, de paquet généré, de fiche, régénération de fiche, de carte mentale, et chaque remise d'une tentative contenant des réponses courtes ou ouvertes.

### Périmètre (`StudyScope`)

```ts
type StudyScope = { partIds?: string[]; documentIds?: string[] };
```

Absent ou vide = tout le cours (documents prêts). `partIds` = ids de `course_parts` du cours ; `documentIds` = ids de documents prêts du cours. Les deux se cumulent. Ids inconnus ignorés ; si rien ne reste → `400`. Le texte envoyé à l'IA est plafonné (≈ 45 000 à 50 000 caractères ; 15 000 pour le test rapide) : au-delà, une sélection d'extraits répartie sur tout le périmètre est utilisée.

### Sources (`Source`)

Même type que les sources du chat (`src/lib/course/sources.ts`) : `{ n, chunkId, documentId, filename, kind, page, section, excerpt }`.

### LaTeX

Les textes générés (énoncés, choix, explications, cartes, fiches) peuvent contenir du LaTeX entre `$...$` : les afficher avec `react-markdown` + `remark-math` + `rehype-katex`, comme le chat. `SheetData.formulas[].latex` est **sans** délimiteurs.

---

## 1. Quiz, examen blanc, test rapide

Un même modèle sert aux trois modes (`QuizMode = "quiz" | "exam" | "quick"`). Cycle : **créer** (une tentative démarre automatiquement) → **répondre** → **remettre** → **correction**. Pour refaire : **nouvelle tentative**.

Les questions sont envoyées **sans réponses** (`PublicQuestion`) tant que la tentative n'est pas remise ; la correction (`AttemptResult`) révèle les questions complètes (`Question`), avec explication et sources.

### `POST /study/quizzes` — générer

Corps : `CreateQuizRequest`

```ts
type CreateQuizRequest =
  | { mode: "quiz"; count?: number /* 3-30, déf. 10 */; difficulty?: Difficulty | "mixte" /* déf. "mixte" */;
      types?: ("single" | "multiple" | "truefalse" | "short")[] /* déf. les quatre */; scope?: StudyScope }
  | { mode: "exam"; durationMinutes?: number /* 5-240, déf. 60 */; count?: number /* 4-25, déf. 10 */;
      difficulty?: Difficulty | "mixte"; scope?: StudyScope }
  | { mode: "quick"; targetWeak?: boolean /* déf. true */; scope?: StudyScope };
type Difficulty = "facile" | "moyen" | "difficile";
```

- `mode` absent = `"quiz"` (valeur inconnue → `400`).
- **exam** : tous les types, dont environ un tiers de questions ouvertes (`open`) avec barème ; `timeLimitSec = durationMinutes × 60`.
- **quick** : 5 questions `single`/`truefalse`, 1 point chacune. Avec `targetWeak` (défaut), vise les notions faibles (`StatsResponse.weakConcepts`) ; sans périmètre, les extraits sont choisis par recherche sémantique sur ces notions. `quiz.config.targetConcepts` liste les notions visées (vide = test général).
- Le nombre de questions obtenu peut être légèrement inférieur à `count` (au moins 70 %) : utiliser `quiz.questions.length`.

Réponse `201` : `CreateQuizResponse = { quiz: PublicQuiz; attempt: AttemptSummary }`

```ts
type PublicQuiz = { id; courseId; mode: QuizMode; title: string; config: QuizConfig; timeLimitSec: number | null;
                    questions: PublicQuestion[]; createdAt: string };
type QuizConfig = { count: number; difficulty: Difficulty | "mixte"; types: QuestionType[]; scope: StudyScope; targetConcepts?: string[] };
type PublicQuestion =
  | { id: string /* "q1"… */; type: "single" | "multiple"; prompt; concept; difficulty; points: number; choices: string[] }
  | { id: string; type: "truefalse" | "short" | "open"; prompt; concept; difficulty; points: number };
type AttemptSummary = { id; startedAt: string; deadlineAt: string | null; submittedAt: string | null;
                        score: number | null; maxScore: number | null; percent: number | null /* 0-100 */; late: boolean };
```

Points par défaut : single 1, truefalse 1, multiple 2, short 2, open = somme du barème (test rapide : 1 partout).

### `GET /study/quizzes` — lister

Réponse : `{ quizzes: QuizSummary[] }` (100 plus récents)

```ts
type QuizSummary = { id; mode: QuizMode; title; questionCount: number; timeLimitSec: number | null; createdAt;
                     attemptCount: number /* remises */; bestPercent: number | null; lastPercent: number | null };
```

### `GET /study/quizzes/{quizId}` — détail

Réponse : `QuizDetailResponse = { quiz: PublicQuiz; attempts: AttemptSummary[] }` (tentatives de la plus récente à la plus ancienne).

### `DELETE /study/quizzes/{quizId}`

Réponse : `{ ok: true }` (tentatives supprimées avec ; l'historique de maîtrise est conservé).

### `POST /study/quizzes/{quizId}/attempts` — nouvelle tentative

Corps : aucun. Réponse `201` : `{ attempt: AttemptSummary }`. Examen blanc : `deadlineAt = maintenant + timeLimitSec`.

### `GET /study/quizzes/{quizId}/attempts/{attemptId}` — état

Réponse : `AttemptResponse`

```ts
type AttemptResponse =
  | { status: "in_progress"; attempt: AttemptSummary }
  | { status: "submitted"; attempt: AttemptResult };
```

### `POST /study/quizzes/{quizId}/attempts/{attemptId}` — remettre et corriger

Corps : `SubmitAttemptRequest = { answers: Answers }`

```ts
type Answers = Record<string /* question id */, AnswerValue>;
type AnswerValue = number /* single : index */ | number[] /* multiple : indices */ | boolean /* truefalse */
                 | string /* short, open : 6 000 caractères max */ | null /* sans réponse */;
```

Questions absentes ou valeur du mauvais type = sans réponse. Réponse : `AttemptResponse` (toujours `status: "submitted"` en cas de succès).

```ts
type AttemptResult = AttemptSummary & {
  quizId: string; submittedAt: string; score: number; maxScore: number; percent: number;
  feedback: string | null;          // appréciation générale (IA) ou « Notions à revoir : … »
  results: QuestionResult[];        // même ordre que questions
  questions: Question[];            // questions complètes, réponses révélées
};
type QuestionResult = {
  questionId: string; status: "correct" | "partial" | "incorrect" | "unanswered";
  score: number; maxScore: number; given: AnswerValue;
  feedback: string | null;          // réponses courtes / ouvertes corrigées par l'IA
  rubricScores?: { criterion: string; points: number; maxPoints: number }[]; // questions ouvertes
};
type Question =
  | { …base; type: "single"; choices: string[]; answer: number; explanation: string; sources: Source[] }
  | { …base; type: "multiple"; choices: string[]; answers: number[]; explanation; sources }
  | { …base; type: "truefalse"; answer: boolean; explanation; sources }
  | { …base; type: "short"; expected: string; explanation; sources }
  | { …base; type: "open"; expected: string; rubric: { criterion: string; points: number }[]; explanation; sources };
// base = { id, prompt, concept, difficulty, points }
```

Correction :
- `single` / `truefalse` : tout ou rien. `multiple` : crédit partiel `max(0, (justes − fausses) / nb bonnes) × points`, arrondi au demi-point.
- `short` : identique à la réponse attendue (accents, casse, articles ignorés) → juste sans IA ; sinon corrigée par l'IA (synonymes acceptés, demi-points).
- `open` : corrigée par l'IA selon le barème (`rubricScores`).
- **Idempotent** : une tentative déjà remise renvoie sa correction. Les réponses sont **figées au premier envoi** : si l'IA échoue (5xx ou 429, message se terminant par « Tes réponses sont enregistrées : relance la correction. »), renvoyer la même requête relance la correction avec les réponses enregistrées.
- **Examen chronométré** : le serveur n'interdit pas une remise tardive mais la marque `late: true` (au-delà de `deadlineAt` + 2 min). L'interface doit afficher le chrono à partir de `deadlineAt` et remettre automatiquement à zéro.
- Chaque question corrigée alimente la maîtrise de sa notion (`concept`).

---

## 2. Flashcards (répétition espacée SM-2)

```ts
type Flashcard = { id; deckId; front: string; back: string; concept: string | null; sources: Source[];
                   ease: number; intervalDays: number; repetitions: number; lapses: number;
                   dueAt: string; lastReviewedAt: string | null; suspended: boolean; createdAt; updatedAt };
type DeckSummary = { id; title; createdAt; cardCount: number; dueCount: number; newCount: number };
type DeckResponse = { deck: DeckSummary; cards: Flashcard[] };
type IntervalPreview = Record<Rating, number>; // jours ; < 1 = fraction de jour (0.0069 ≈ 10 min)
type Rating = "again" | "hard" | "good" | "easy";
```

Une nouvelle carte est due immédiatement (`dueAt` = création). `dueCount` = cartes non suspendues dont `dueAt` ≤ maintenant ; `newCount` = jamais révisées.

| Méthode | Chemin | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/study/decks` | — | `{ decks: DeckSummary[] }` |
| POST | `/study/decks` | `CreateDeckRequest` | `201` `DeckResponse` |
| GET | `/study/decks/{deckId}` | — | `DeckResponse` (cartes par date de création) |
| PATCH | `/study/decks/{deckId}` | `UpdateDeckRequest = { title: string }` (200 car. max) | `DeckResponse` |
| DELETE | `/study/decks/{deckId}` | — | `{ ok: true }` (cartes supprimées avec) |
| POST | `/study/decks/{deckId}/cards` | `CreateCardRequest` | `201` `CardResponse = { card: Flashcard }` |
| PATCH | `/study/cards/{cardId}` | `UpdateCardRequest` | `CardResponse` |
| DELETE | `/study/cards/{cardId}` | — | `{ ok: true }` |
| POST | `/study/cards/{cardId}/review` | `ReviewRequest = { rating: Rating }` | `ReviewResponse` |
| GET | `/study/cards/due?deckId=&limit=&before=` | — | `DueCardsResponse` |

```ts
type CreateDeckRequest = { title?: string; count?: number /* 5-50, déf. 20 */; scope?: StudyScope; empty?: boolean };
// empty: true → paquet vide, sans IA (titre par défaut « Nouveau paquet ») ; sinon cartes générées (titre proposé par l'IA si absent)
type CreateCardRequest = { front: string /* 1-2000 */; back: string /* 1-4000 */; concept?: string | null /* 120 */ };
type UpdateCardRequest = { front?: string; back?: string; concept?: string | null /* null ou "" = retirer */; suspended?: boolean };
type ReviewResponse = { card: Flashcard /* mise à jour */; next: IntervalPreview /* aperçu pour la révision suivante */ };
type DueCardsResponse = { cards: (Flashcard & { preview: IntervalPreview })[]; total: number /* total dû, au-delà de limit */ };
```

`/study/cards/due` : `deckId` facultatif (tout le cours sinon) ; `limit` 1-200 (défaut 50) ; `before` = date ISO (défaut maintenant ; ex. fin de la journée locale pour « à réviser aujourd'hui »). Tri : les plus en retard d'abord. `preview` donne l'intervalle obtenu pour chaque note (à afficher sur les boutons).

SM-2 (variante Anki) : `again` → revient dans 10 min, `repetitions` = 0, facilité −0,2 ; 1ʳᵉ réussite : hard/good 1 j, easy 4 j ; 2ᵉ : hard 2 j, good 4 j, easy 7 j ; ensuite hard ×1,2 (facilité −0,15), good ×facilité, easy ×facilité×1,3 (facilité +0,15) ; facilité bornée à [1,3 ; 3,0], intervalle ≤ 365 j. Une révision d'une carte avec `concept` alimente la maîtrise (again 0, hard 0,5, good 0,85, easy 1).

---

## 3. Fiches de révision

```ts
type SheetData = { title: string; summary: string;
  keyConcepts: { term: string; explanation: string }[];
  definitions: { term: string; definition: string }[];
  formulas: { name: string; latex: string /* sans $ */; explanation: string }[];
  pitfalls: string[]; sources: Source[] };
type SheetSummary = { id; title; scope: StudyScope; createdAt; updatedAt };
type Sheet = SheetSummary & { data: SheetData; content: string /* markdown complet */; model: string | null };
type SheetResponse = { sheet: Sheet };
type CreateSheetRequest = { scope?: StudyScope; title?: string /* 200 */ };
```

| Méthode | Chemin | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/study/sheets` | — | `{ sheets: SheetSummary[] }` (par mise à jour décroissante) |
| POST | `/study/sheets` | `CreateSheetRequest` | `201` `SheetResponse` |
| GET | `/study/sheets/{sheetId}` | — | `SheetResponse` |
| POST | `/study/sheets/{sheetId}/regenerate` | — | `SheetResponse` (même id, périmètre et titre ; contenu remplacé) |
| DELETE | `/study/sheets/{sheetId}` | — | `{ ok: true }` |

`content` est le markdown prêt à afficher (sections « En bref », « Notions clés », « Définitions », « Formules » (`$…$`), « Pièges à éviter », « Sources ») ; `data` permet un rendu personnalisé.

---

## 4. Cartes mentales

```ts
type MindMapNode = { id: string /* "n0", "n0.1", "n0.1.2"… */; label: string; summary?: string; children: MindMapNode[] };
type MindMapSummary = { id; title; scope: StudyScope; createdAt };
type MindMap = MindMapSummary & { tree: MindMapNode /* racine */; model: string | null };
type MindMapResponse = { mindmap: MindMap };
type CreateMindMapRequest = { scope?: StudyScope; title?: string };
```

Arbre : 4 niveaux max (racine comprise), 10 enfants max par nœud, 80 nœuds max, racine avec au moins 2 branches.

| Méthode | Chemin | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/study/mindmaps` | — | `{ mindmaps: MindMapSummary[] }` |
| POST | `/study/mindmaps` | `CreateMindMapRequest` | `201` `MindMapResponse` |
| GET | `/study/mindmaps/{mapId}` | — | `MindMapResponse` |
| DELETE | `/study/mindmaps/{mapId}` | — | `{ ok: true }` |

---

## 5. Progression et points faibles

### `GET /study/stats`

Réponse : `StatsResponse`

```ts
type StatsResponse = {
  concepts: ConceptMastery[];       // de la plus faible à la mieux maîtrisée
  weakConcepts: ConceptMastery[];   // ≤ 5 : mastery < 0,6 avec ≥ 2 évaluations, sinon les plus faibles < 0,8
  totals: { quizzesTaken: number; averagePercent: number | null; cardsTotal: number; cardsDue: number;
            reviewsLast7Days: number; streakDays: number };
  recentAttempts: (AttemptSummary & { quizId: string; mode: QuizMode; title: string })[]; // 10 dernières remises
};
type ConceptMastery = { key: string; label: string; mastery: number /* 0-1 */; level: "faible" | "moyen" | "maitrise";
                        attempts: number; lastSeenAt: string };
```

Maîtrise = moyenne des scores (0-1) des questions et révisions de la notion, pondérée par la récence (demi-vie 14 jours), avec un a priori de 0,5 (poids 1). `level` : < 0,5 faible, < 0,8 moyen, sinon maîtrisé. Les libellés de notions déjà suivis sont transmis à l'IA lors des générations suivantes pour rester cohérents. `streakDays` : jours consécutifs (UTC) avec un quiz remis ou une carte révisée, jusqu'à aujourd'hui (ou hier).

Pour lancer un test rapide ciblé : `POST /study/quizzes` avec `{ "mode": "quick" }`.

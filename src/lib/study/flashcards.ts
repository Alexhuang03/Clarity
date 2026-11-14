import "server-only";
import { modelChain } from "@/lib/ai/models";
import type { Source } from "@/lib/course/sources";
import { loadScopedContent, pickSources, type CourseContext } from "./content";
import { dbError, enforceStudyLimit, scopeSchema, type Session } from "./http";
import { generateJson, StudyError } from "./llm";
import { knownConcepts, recordConceptEvents } from "./mastery";
import { conceptsBlock, flashcardsPrompt } from "./prompts";
import { STUDY_TEXTS } from "./texts";
import { dueDate, nextState, previewIntervals, RATING_SCORE } from "./srs";
import type {
  CreateCardRequest,
  CreateDeckRequest,
  DeckResponse,
  DeckSummary,
  DueCardsResponse,
  Flashcard,
  Rating,
  ReviewResponse,
  UpdateCardRequest,
} from "./types";
import { fixLatexEscapes, v, type Schema } from "./validate";

const BUDGET = 45_000;
const FRONT_MAX = 2000;
const BACK_MAX = 4000;
const CONCEPT_MAX = 120;
const DECK_CARDS_MAX = 2000;
const DECKS_MAX = 200;

const CARD_COLUMNS =
  "id, deck_id, front, back, concept, sources, ease, interval_days, repetitions, lapses, due_at, last_reviewed_at, suspended, created_at, updated_at";

type CardRow = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  concept: string | null;
  sources: Source[];
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string | null;
  suspended: boolean;
  created_at: string;
  updated_at: string;
};

function toCard(c: CardRow): Flashcard {
  return {
    id: c.id,
    deckId: c.deck_id,
    front: c.front,
    back: c.back,
    concept: c.concept,
    sources: c.sources,
    ease: c.ease,
    intervalDays: c.interval_days,
    repetitions: c.repetitions,
    lapses: c.lapses,
    dueAt: c.due_at,
    lastReviewedAt: c.last_reviewed_at,
    suspended: c.suspended,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

const stateOf = (c: CardRow) => ({ ease: c.ease, intervalDays: c.interval_days, repetitions: c.repetitions, lapses: c.lapses });

// ------------------------------------------------------------------ Schémas des requêtes

export const createDeckSchema: Schema<CreateDeckRequest> = v.object({
  title: v.optional(v.string({ max: 200 })),
  count: v.optional(v.number({ int: true, min: 5, max: 50 }), 20),
  scope: scopeSchema,
  empty: v.optional(v.boolean(), false),
});
export const updateDeckSchema = v.object({ title: v.string({ max: 200 }) });
export const createCardSchema: Schema<CreateCardRequest> = v.object({
  front: v.string({ max: FRONT_MAX }),
  back: v.string({ max: BACK_MAX }),
  concept: v.optional(v.string({ max: CONCEPT_MAX })),
});
export const updateCardSchema: Schema<UpdateCardRequest> = (input, path) => {
  const r = v.object({
    front: v.optional(v.string({ max: FRONT_MAX })),
    back: v.optional(v.string({ max: BACK_MAX })),
    concept: v.any(),
    suspended: v.optional(v.boolean()),
  })(input, path);
  if (!r.ok) return r;
  // concept : absent = inchangé, null ou "" = retiré
  const raw = (input as { concept?: unknown }).concept;
  const value: UpdateCardRequest = { ...r.value, concept: undefined };
  delete value.concept;
  if (raw === null || raw === "") value.concept = null;
  else if (raw !== undefined) {
    const c = v.string({ max: CONCEPT_MAX })(raw, "concept");
    if (!c.ok) return c;
    value.concept = c.value;
  }
  return { ok: true, value };
};
export const reviewSchema = v.object({ rating: v.literal<Rating>("again", "hard", "good", "easy") });

// ------------------------------------------------------------------ Paquets

/** dueBefore : date limite de dueCount (défaut maintenant ; ex. fin de la journée locale pour « aujourd'hui »). */
async function deckSummaries(
  { supabase, courseId }: Session,
  deckIds?: string[],
  dueBefore?: Date,
): Promise<DeckSummary[]> {
  let query = supabase.from("study_decks").select("id, title, created_at").eq("course_id", courseId);
  if (deckIds) query = query.in("id", deckIds);
  const { data: decks, error } = await query.order("created_at", { ascending: false }).limit(DECKS_MAX);
  if (error) dbError(error);
  if (!decks?.length) return [];
  const { data: cards, error: cardsError } = await supabase
    .from("study_flashcards")
    .select("deck_id, due_at, suspended, last_reviewed_at")
    .in("deck_id", decks.map((d) => d.id))
    .limit(20_000);
  if (cardsError) dbError(cardsError);
  const now = (dueBefore ?? new Date()).getTime();
  const counts = new Map<string, { card: number; due: number; fresh: number }>();
  for (const c of cards ?? []) {
    const s = counts.get(c.deck_id) ?? { card: 0, due: 0, fresh: 0 };
    s.card += 1;
    if (!c.suspended && new Date(c.due_at).getTime() <= now) s.due += 1;
    if (!c.last_reviewed_at) s.fresh += 1;
    counts.set(c.deck_id, s);
  }
  return decks.map((d) => ({
    id: d.id,
    title: d.title,
    createdAt: d.created_at,
    cardCount: counts.get(d.id)?.card ?? 0,
    dueCount: counts.get(d.id)?.due ?? 0,
    newCount: counts.get(d.id)?.fresh ?? 0,
  }));
}

export const listDecks = (session: Session, dueBefore?: Date) => deckSummaries(session, undefined, dueBefore);

const cardsSchema = (count: number) =>
  v.object({
    title: v.lenient(v.string({ max: 150 }), ""),
    cards: v.array(
      v.object({
        front: v.string({ min: 2, max: FRONT_MAX }),
        back: v.string({ min: 1, max: BACK_MAX }),
        concept: v.lenient(v.optional(v.string({ max: CONCEPT_MAX })), undefined),
        sources: v.lenient(v.optional(v.array(v.number({ int: true }), { dropInvalid: true, max: 10 }), []), []),
      }),
      { dropInvalid: true, max: count, min: Math.max(1, Math.ceil(count * 0.6)) },
    ),
  });

export async function createDeck(
  session: Session & { ctx: CourseContext },
  body: CreateDeckRequest,
): Promise<DeckResponse> {
  const { supabase, userId, courseId, ctx } = session;
  let title = body.title;
  let cards: Omit<CardRow, "id" | "deck_id" | "ease" | "interval_days" | "repetitions" | "lapses" | "due_at" | "last_reviewed_at" | "suspended" | "created_at" | "updated_at">[] = [];

  if (!body.empty) {
    const count = body.count ?? 20;
    const [content, known] = await Promise.all([
      loadScopedContent(supabase, ctx, body.scope ?? {}, BUDGET, { shuffle: true }),
      knownConcepts(supabase, courseId),
    ]);
    await enforceStudyLimit(userId);
    const { value } = await generateJson(
      modelChain("study"),
      {
        system: flashcardsPrompt(count, known.length > 0, ctx.locale),
        user: [conceptsBlock({ known }), content.block].filter(Boolean).join("\n\n"),
        maxTokens: Math.min(12_000, 1000 + count * 220),
        temperature: 0.5,
        beforeRetry: () => enforceStudyLimit(userId),
      },
      cardsSchema(count),
      "génération flashcards",
    );
    title ??= value.title || STUDY_TEXTS[ctx.locale].deckTitle;
    const seen = new Set<string>();
    cards = value.cards
      .filter((c) => !seen.has(c.front.toLowerCase()) && seen.add(c.front.toLowerCase()))
      .map((c) => ({
        front: fixLatexEscapes(c.front),
        back: fixLatexEscapes(c.back),
        concept: c.concept ?? null,
        sources: pickSources(c.sources, content.sources, 3),
      }));
  }

  const { data: deck, error } = await supabase
    .from("study_decks")
    .insert({ user_id: userId, course_id: courseId, title: (title || STUDY_TEXTS[ctx.locale].newDeck).slice(0, 200) })
    .select("id")
    .single();
  if (error || !deck) dbError(error);
  if (cards.length) {
    const { error: cardsError } = await supabase
      .from("study_flashcards")
      .insert(cards.map((c) => ({ ...c, user_id: userId, course_id: courseId, deck_id: deck.id })));
    if (cardsError) {
      await supabase.from("study_decks").delete().eq("id", deck.id);
      dbError(cardsError);
    }
  }
  return getDeck(session, deck.id);
}

export async function getDeck(session: Session, deckId: string): Promise<DeckResponse> {
  const [deck] = await deckSummaries(session, [deckId]);
  if (!deck) throw new StudyError("Paquet introuvable", 404);
  const { data: cards, error } = await session.supabase
    .from("study_flashcards")
    .select(CARD_COLUMNS)
    .eq("deck_id", deckId)
    .order("created_at")
    .limit(DECK_CARDS_MAX);
  if (error) dbError(error);
  return { deck, cards: (cards ?? []).map(toCard) };
}

export async function renameDeck(session: Session, deckId: string, title: string): Promise<DeckResponse> {
  const { data, error } = await session.supabase
    .from("study_decks")
    .update({ title })
    .eq("id", deckId)
    .eq("course_id", session.courseId)
    .select("id");
  if (error) dbError(error);
  if (!data?.length) throw new StudyError("Paquet introuvable", 404);
  return getDeck(session, deckId);
}

export async function deleteDeck({ supabase, courseId }: Session, deckId: string) {
  const { data, error } = await supabase.from("study_decks").delete().eq("id", deckId).eq("course_id", courseId).select("id");
  if (error) dbError(error);
  if (!data?.length) throw new StudyError("Paquet introuvable", 404);
}

// ------------------------------------------------------------------ Cartes

export async function createCard(session: Session, deckId: string, body: CreateCardRequest): Promise<Flashcard> {
  const { supabase, userId, courseId } = session;
  const { data: deck } = await supabase.from("study_decks").select("id").eq("id", deckId).eq("course_id", courseId).maybeSingle();
  if (!deck) throw new StudyError("Paquet introuvable", 404);
  const { data, error } = await supabase
    .from("study_flashcards")
    .insert({ user_id: userId, course_id: courseId, deck_id: deckId, front: body.front, back: body.back, concept: body.concept ?? null })
    .select(CARD_COLUMNS)
    .single();
  if (error || !data) dbError(error);
  return toCard(data as CardRow);
}

async function loadCard({ supabase, courseId }: Session, cardId: string): Promise<CardRow> {
  const { data, error } = await supabase.from("study_flashcards").select(CARD_COLUMNS).eq("id", cardId).eq("course_id", courseId).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Carte introuvable", 404);
  return data as CardRow;
}

export async function updateCard(session: Session, cardId: string, body: UpdateCardRequest): Promise<Flashcard> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.front !== undefined) patch.front = body.front;
  if (body.back !== undefined) patch.back = body.back;
  if (body.concept !== undefined) patch.concept = body.concept;
  if (body.suspended !== undefined) patch.suspended = body.suspended;
  const { data, error } = await session.supabase
    .from("study_flashcards")
    .update(patch)
    .eq("id", cardId)
    .eq("course_id", session.courseId)
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Carte introuvable", 404);
  return toCard(data as CardRow);
}

export async function deleteCard({ supabase, courseId }: Session, cardId: string) {
  const { data, error } = await supabase.from("study_flashcards").delete().eq("id", cardId).eq("course_id", courseId).select("id");
  if (error) dbError(error);
  if (!data?.length) throw new StudyError("Carte introuvable", 404);
}

export async function reviewCard(session: Session, cardId: string, rating: Rating): Promise<ReviewResponse> {
  const { supabase, userId, courseId } = session;
  const card = await loadCard(session, cardId);
  const next = nextState(stateOf(card), rating);
  const now = new Date();
  const { data, error } = await supabase
    .from("study_flashcards")
    .update({
      ease: next.ease,
      interval_days: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      due_at: dueDate(next.intervalDays, now).toISOString(),
      last_reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", cardId)
    .select(CARD_COLUMNS)
    .single();
  if (error || !data) dbError(error);
  const { error: logError } = await supabase
    .from("study_card_reviews")
    .insert({ user_id: userId, course_id: courseId, card_id: cardId, rating, interval_days: next.intervalDays });
  if (logError) console.error("[révision] historique de révision non enregistré", logError);
  if (card.concept) {
    await recordConceptEvents(supabase, courseId, userId, [
      { concept: card.concept, score: RATING_SCORE[rating], source: "flashcard", refId: cardId },
    ]);
  }
  return { card: toCard(data as CardRow), next: previewIntervals(next) };
}

/** Cartes à réviser (échéance passée avant `before`, par défaut maintenant), les plus en retard d'abord. */
export async function dueCards(
  { supabase, courseId }: Session,
  opts: { deckId?: string; before?: Date; limit: number },
): Promise<DueCardsResponse> {
  let query = supabase
    .from("study_flashcards")
    .select(CARD_COLUMNS, { count: "exact" })
    .eq("course_id", courseId)
    .eq("suspended", false)
    .lte("due_at", (opts.before ?? new Date()).toISOString());
  if (opts.deckId) query = query.eq("deck_id", opts.deckId);
  const { data, error, count } = await query.order("due_at").limit(opts.limit);
  if (error) dbError(error);
  return {
    cards: (data ?? []).map((c) => ({ ...toCard(c as CardRow), preview: previewIntervals(stateOf(c as CardRow)) })),
    total: count ?? data?.length ?? 0,
  };
}

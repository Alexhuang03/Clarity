"use client";

import { useCallback, useEffect, useState } from "react";
import CountUp from "@/components/reactbits/CountUp";
import type {
  CardResponse,
  DeckResponse,
  DeckSummary,
  DueCardsResponse,
  Flashcard,
  IntervalPreview,
  Rating,
  ReviewResponse,
  StudyScope,
} from "@/lib/study/types";
import { endOfToday, errorMessage, formatInterval, studyApi } from "./api";
import {
  DeleteButton,
  ErrorNote,
  Field,
  Generating,
  ListSkeleton,
  Md,
  ScopePicker,
  SectionTitle,
  Segmented,
  Sources,
  ToolIntro,
  type ScopeOptions,
} from "./ui";
import { useStudyResource } from "./use-study";
import { useT } from "@/lib/i18n/client";

type View = { kind: "home" } | { kind: "generating" } | { kind: "deck"; deckId: string } | { kind: "review"; deckId?: string; title?: string };

const RATINGS: { value: Rating; key: string; tone: string }[] = [
  { value: "again", key: "1", tone: "hover:border-red-500/50 hover:bg-red-500/10 hover:text-danger" },
  { value: "hard", key: "2", tone: "hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300" },
  { value: "good", key: "3", tone: "hover:border-green-500/50 hover:bg-green-500/10 hover:text-success" },
  { value: "easy", key: "4", tone: "hover:border-accent/50 hover:bg-accent-soft hover:text-accent-text" },
];

export function FlashcardsTool({ courseId, scopeOptions }: { courseId: string; scopeOptions: ScopeOptions }) {
  const [view, setView] = useState<View>({ kind: "home" });
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  // Un seul appel : dueCount de chaque paquet compte les cartes dues d'ici la fin de la journée
  const [dueToday] = useState(endOfToday);
  const decks = useStudyResource<{ decks: DeckSummary[] }>(courseId, `/decks?before=${encodeURIComponent(dueToday)}`);

  const home = () => {
    setView({ kind: "home" });
    decks.reload();
  };

  async function create(body: { count?: number; scope?: StudyScope; title?: string; empty?: boolean }) {
    setError(null);
    if (!body.empty) setView({ kind: "generating" });
    try {
      const res = await studyApi<DeckResponse>(courseId, "/decks", { method: "POST", body });
      decks.reload();
      setView({ kind: "deck", deckId: res.deck.id });
    } catch (e) {
      setError(errorMessage(e));
      setView({ kind: "home" });
    }
  }

  if (view.kind === "generating") {
    return <Generating hint={t.study.cards.generatingHint} />;
  }
  if (view.kind === "review") {
    return <ReviewSession courseId={courseId} deckId={view.deckId} title={view.title} onDone={home} />;
  }
  if (view.kind === "deck") {
    return (
      <DeckEditor
        courseId={courseId}
        deckId={view.deckId}
        onBack={home}
        onReview={(title) => setView({ kind: "review", deckId: view.deckId, title })}
        onDeleted={home}
      />
    );
  }

  const totalDue = decks.data?.decks.reduce((sum, d) => sum + d.dueCount, 0) ?? 0;
  return (
    <>
      <ToolIntro
        title={t.study.tools.flashcards.label}
        action={
          <button
            type="button"
            disabled={totalDue === 0}
            onClick={() => setView({ kind: "review" })}
            className="btn btn-primary"
          >
            {t.study.cards.reviewNow}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{totalDue}</span>
          </button>
        }
      >
        {t.study.cards.intro}{" "}
        {decks.data && (
          <strong className="font-medium text-foreground">
            {totalDue === 0
              ? t.study.cards.nothingToday
              : t.study.cards.dueToday(totalDue)}
          </strong>
        )}
      </ToolIntro>
      <div className="space-y-10">
        <ErrorNote message={error} />
        <CreateDeck scopeOptions={scopeOptions} onCreate={create} />
        <section>
          <SectionTitle>{t.study.cards.myDecks}</SectionTitle>
          {decks.loading && !decks.data ? (
            <ListSkeleton />
          ) : decks.error ? (
            <ErrorNote message={decks.error} onRetry={decks.reload} />
          ) : !decks.data?.decks.length ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
              {t.study.cards.noDecks}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {decks.data.decks.map((d, i) => (
                <li key={d.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <div className="card flex h-full flex-col p-5">
                    <button
                      type="button"
                      onClick={() => setView({ kind: "deck", deckId: d.id })}
                      className="text-left font-medium hover:text-accent-text"
                    >
                      {d.title}
                    </button>
                    <p className="mt-1 text-xs text-muted">
                      {t.study.cards.cardsCount(d.cardCount)}
                      {d.newCount > 0 && t.study.cards.newCount(d.newCount)}
                    </p>
                    <div className="mt-auto flex items-center gap-2 pt-5">
                      <button
                        type="button"
                        disabled={d.dueCount === 0}
                        onClick={() => setView({ kind: "review", deckId: d.id, title: d.title })}
                        className="btn btn-secondary px-3 py-1.5"
                      >
                        {d.dueCount > 0 ? t.study.cards.review(d.dueCount) : t.study.cards.upToDate}
                      </button>
                      <button
                        type="button"
                        onClick={() => setView({ kind: "deck", deckId: d.id })}
                        className="btn btn-ghost px-3 py-1.5"
                      >
                        {t.common.edit}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Création

function CreateDeck({
  scopeOptions,
  onCreate,
}: {
  scopeOptions: ScopeOptions;
  onCreate: (body: { count?: number; scope?: StudyScope; title?: string; empty?: boolean }) => void;
}) {
  const [count, setCount] = useState(20);
  const { t } = useT();
  const [scope, setScope] = useState<StudyScope>({});
  const [title, setTitle] = useState("");
  return (
    <div className="card rise-in">
      <div className="space-y-6 p-6">
        <Field label={t.study.titleLabel} hint={t.study.cards.titleHint}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t.study.cards.titlePlaceholder} className="field" />
        </Field>
        <Field label={t.study.cards.countLabel}>
          <Segmented label={t.study.cards.countLabel} value={count} onChange={setCount} options={[10, 20, 30, 50].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
        <ScopePicker options={scopeOptions} value={scope} onChange={setScope} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
        <button type="button" onClick={() => onCreate({ empty: true, title: title.trim() || undefined })} className="btn btn-ghost">
          {t.study.cards.createEmpty}
        </button>
        <button type="button" onClick={() => onCreate({ count, scope, title: title.trim() || undefined })} className="btn btn-primary">
          {t.study.cards.generate}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Paquet : titre et cartes

function CardForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { front: string; back: string; concept: string | null };
  submitLabel: string;
  onSubmit: (card: { front: string; back: string; concept: string | null }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [concept, setConcept] = useState(initial?.concept ?? "");
  const [busy, setBusy] = useState(false);
  const { t } = useT();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSubmit({ front: front.trim(), back: back.trim(), concept: concept.trim() || null });
        setBusy(false);
        if (ok && !initial) {
          setFront("");
          setBack("");
          setConcept("");
        }
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted">{t.study.cards.front}</span>
          <textarea required value={front} onChange={(e) => setFront(e.target.value)} maxLength={2000} rows={3} className="field resize-y" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted">{t.study.cards.back}</span>
          <textarea required value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} rows={3} className="field resize-y" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          maxLength={120}
          placeholder={t.study.cards.concept}
          aria-label={t.study.cards.conceptLabel}
          className="field max-w-xs py-1.5 text-sm"
        />
        <span className="hidden text-xs text-muted sm:inline">{t.study.cards.latexHint}</span>
        <span className="ml-auto flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn btn-ghost">
              {t.common.cancel}
            </button>
          )}
          <button disabled={busy || !front.trim() || !back.trim()} className="btn btn-primary">
            {busy ? "…" : submitLabel}
          </button>
        </span>
      </div>
    </form>
  );
}

function CardRow({
  card,
  onSave,
  onToggle,
  onDelete,
}: {
  card: Flashcard;
  onSave: (patch: { front: string; back: string; concept: string | null }) => Promise<boolean>;
  onToggle: () => void;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const { t, intl } = useT();
  if (editing) {
    return (
      <li className="card p-4">
        <CardForm
          initial={card}
          submitLabel={t.common.save}
          onCancel={() => setEditing(false)}
          onSubmit={async (patch) => {
            const ok = await onSave(patch);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </li>
    );
  }
  return (
    <li className={`card group grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] ${card.suspended ? "opacity-55" : ""}`}>
      <Md text={card.front} className="font-medium" />
      <Md text={card.back} className="text-muted sm:border-l sm:border-line sm:pl-3" />
      <div className="flex items-start gap-0.5 sm:opacity-60 sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground">
          {t.common.edit}
        </button>
        <button
          type="button"
          onClick={onToggle}
          title={card.suspended ? t.study.cards.reactivateTitle : t.study.cards.suspendTitle}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
        >
          {card.suspended ? t.study.cards.reactivate : t.study.cards.suspend}
        </button>
        <DeleteButton onDelete={onDelete} label={t.study.cards.deleteCard} />
      </div>
      <p className="text-xs text-muted sm:col-span-3">
        {card.concept && <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5">{card.concept}</span>}
        {card.suspended
          ? t.study.cards.suspended
          : card.lastReviewedAt
            ? t.study.cards.nextReview(new Date(card.dueAt).toLocaleDateString(intl, { day: "numeric", month: "short" }))
            : t.study.cards.newCard}
      </p>
    </li>
  );
}

function DeckEditor({
  courseId,
  deckId,
  onBack,
  onReview,
  onDeleted,
}: {
  courseId: string;
  deckId: string;
  onBack: () => void;
  onReview: (title: string) => void;
  onDeleted: () => void;
}) {
  const deck = useStudyResource<DeckResponse>(courseId, `/decks/${deckId}`);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const { t } = useT();
  // Cartes dues d'ici la fin de la journée (comme la session de révision)
  const [todayEnd] = useState(() => new Date(endOfToday()).getTime());

  async function call<T>(fn: () => Promise<T>): Promise<T | null> {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  }
  const replaceCard = (card: Flashcard) =>
    deck.setData((d) => (d ? { ...d, cards: d.cards.map((c) => (c.id === card.id ? card : c)) } : d));

  if (deck.loading && !deck.data) return <ListSkeleton rows={5} />;
  if (!deck.data) return <ErrorNote message={deck.error} onRetry={deck.reload} />;
  const { deck: summary, cards } = deck.data;
  const dueCount = cards.filter((c) => !c.suspended && new Date(c.dueAt).getTime() <= todayEnd).length;

  return (
    <div className="mx-auto max-w-3xl">
      <button type="button" onClick={onBack} className="btn btn-ghost -ml-3 mb-4 px-3 py-1.5 font-normal">
        {t.study.cards.backToDecks}
      </button>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {title === null ? (
          <h2 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
            <button type="button" onClick={() => setTitle(summary.title)} title={t.study.cards.rename} className="text-left hover:text-accent-text">
              {summary.title}
            </button>
          </h2>
        ) : (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await call(() =>
                studyApi<DeckResponse>(courseId, `/decks/${deckId}`, { method: "PATCH", body: { title: title.trim() } }),
              );
              if (res) {
                deck.setData(() => res);
                setTitle(null);
              }
            }}
          >
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setTitle(null)}
              maxLength={200}
              aria-label={t.study.cards.deckTitle}
              className="field text-lg font-semibold"
            />
            <button disabled={!title.trim()} className="btn btn-primary">
              {t.common.ok}
            </button>
          </form>
        )}
        <button type="button" disabled={dueCount === 0} onClick={() => onReview(summary.title)} className="btn btn-primary">
          {t.study.cards.review(dueCount)}
        </button>
        <DeleteButton
          label={t.study.cards.deleteDeck}
          onDelete={async () => {
            const ok = await call(() => studyApi(courseId, `/decks/${deckId}`, { method: "DELETE" }));
            if (ok) onDeleted();
          }}
        />
      </div>
      <ErrorNote message={error} />

      <div className="card mt-4 p-4">
        <p className="mb-3 text-sm font-medium">{t.study.cards.addCard}</p>
        <CardForm
          submitLabel={t.study.cards.add}
          onSubmit={async (card) => {
            const res = await call(() =>
              studyApi<CardResponse>(courseId, `/decks/${deckId}/cards`, { method: "POST", body: card }),
            );
            if (res) deck.setData((d) => (d ? { ...d, cards: [...d.cards, res.card] } : d));
            return !!res;
          }}
        />
      </div>

      <div className="mt-8">
        <SectionTitle>
          {t.study.cards.cardsCount(cards.length)}
        </SectionTitle>
      </div>
      <ul className="space-y-2">
        {cards.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            onSave={async (patch) => {
              const res = await call(() =>
                studyApi<CardResponse>(courseId, `/cards/${card.id}`, { method: "PATCH", body: patch }),
              );
              if (res) replaceCard(res.card);
              return !!res;
            }}
            onToggle={async () => {
              const res = await call(() =>
                studyApi<CardResponse>(courseId, `/cards/${card.id}`, { method: "PATCH", body: { suspended: !card.suspended } }),
              );
              if (res) replaceCard(res.card);
            }}
            onDelete={async () => {
              const ok = await call(() => studyApi(courseId, `/cards/${card.id}`, { method: "DELETE" }));
              if (ok) deck.setData((d) => (d ? { ...d, cards: d.cards.filter((c) => c.id !== card.id) } : d));
            }}
          />
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Session de révision

type QueueCard = Flashcard & { preview: IntervalPreview };

function ReviewSession({
  courseId,
  deckId,
  title,
  onDone,
}: {
  courseId: string;
  deckId?: string;
  title?: string;
  onDone: () => void;
}) {
  const [before] = useState(endOfToday);
  const initial = useStudyResource<DueCardsResponse>(
    courseId,
    `/cards/due?limit=200&before=${encodeURIComponent(before)}${deckId ? `&deckId=${deckId}` : ""}`,
  );
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const { t, intl } = useT();
  const [error, setError] = useState<string | null>(null);

  const cards = queue ?? initial.data?.cards ?? null;
  const card = cards?.[0];

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await studyApi<ReviewResponse>(courseId, `/cards/${card.id}/review`, {
          method: "POST",
          body: { rating },
        });
        const rest = (cards ?? []).slice(1);
        // Carte à revoir dans la journée (« À revoir » = 10 min) : elle revient en fin de session
        const again = new Date(res.card.dueAt).getTime() <= new Date(before).getTime();
        setQueue(again ? [...rest, { ...res.card, preview: res.next }] : rest);
        setReviewed((n) => n + 1);
        setFlipped(false);
      } catch (e) {
        setError(errorMessage(e));
      }
      setBusy(false);
    },
    [card, busy, cards, courseId, before],
  );

  // Clavier : Espace / Entrée pour retourner, 1 à 4 pour noter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        // Sur un bouton, Espace / Entrée gardent leur effet normal (le clic)
        if (target?.closest("button")) return;
        e.preventDefault();
        setFlipped(true);
      } else if (flipped) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) void rate(r.value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, rate]);

  if (!cards) {
    return initial.error ? <ErrorNote message={initial.error} onRetry={initial.reload} /> : <ListSkeleton rows={1} />;
  }

  if (!card) {
    return (
      <div className="card rise-in mx-auto max-w-md p-8 text-center">
        <p className="text-5xl">🎉</p>
        <p className="mt-4 text-xl font-semibold tracking-tight">{t.study.cards.sessionDone}</p>
        <p className="mt-2 text-muted">
          {reviewed > 0 ? (
            <>
              <CountUp to={reviewed} duration={0.8} trigger="load" /> {t.study.cards.reviewedToday(reviewed)}
            </>
          ) : (
            t.study.cards.nothingNow
          )}
        </p>
        <button type="button" onClick={onDone} className="btn btn-primary mt-6">
          {t.study.finish}
        </button>
      </div>
    );
  }

  const total = reviewed + cards.length;
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={onDone} className="btn btn-ghost -ml-3 px-3 py-1.5 font-normal">
          {t.study.cards.stop}
        </button>
        <span className="truncate text-sm text-muted">{title ?? t.study.cards.allCards}</span>
        <span className="text-sm tabular-nums text-muted">
          {t.study.cards.remaining(cards.length)}
        </span>
      </div>
      <div className="mb-6 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(reviewed / total) * 100}%` }} />
      </div>

      {/* Carte retournable : recto et verso dans la même case de grille (hauteur = la plus grande face) */}
      <div className="[perspective:1400px]">
        <button
          type="button"
          key={card.id + reviewed}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? t.study.cards.flipBack : t.study.cards.flip}
          className={`grid w-full text-left transition-transform duration-500 ease-[var(--ease-out-soft)] [transform-style:preserve-3d] motion-reduce:transition-none ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          <span className="card flex min-h-64 flex-col p-8 [backface-visibility:hidden] [grid-area:1/1]">
            <span className="eyebrow">
              {t.study.cards.question}
              {card.concept ? ` · ${card.concept}` : ""}
            </span>
            <span className="flex flex-1 items-center justify-center py-6 text-center text-lg">
              <Md text={card.front} />
            </span>
            <span className="text-center text-xs text-muted">{t.study.cards.flipHint}</span>
          </span>
          <span className="card flex min-h-64 flex-col p-8 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]">
            <span className="eyebrow">{t.study.cards.answer}</span>
            <span className="flex flex-1 items-center justify-center py-6 text-center">
              <Md text={card.back} />
            </span>
          </span>
        </button>
      </div>

      <div className="mt-4">
        <ErrorNote message={error} />
      </div>

      <div className={`mt-6 transition-opacity duration-300 ${flipped ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!flipped}>
        <p className="mb-3 text-center text-sm text-muted">{t.study.cards.howWasIt}</p>
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={busy || !flipped}
              tabIndex={flipped ? 0 : -1}
              onClick={() => void rate(r.value)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border border-line bg-surface px-2 py-3 text-sm font-medium transition disabled:opacity-50 ${r.tone}`}
            >
              {t.study.cards.ratings[r.value]}
              <span className="text-xs font-normal tabular-nums text-muted">{formatInterval(card.preview[r.value], t, intl)}</span>
              <kbd className="mt-1 hidden rounded border border-line px-1.5 text-[0.6rem] font-normal text-muted sm:inline">{r.key}</kbd>
            </button>
          ))}
        </div>
      </div>
      {card.sources.length > 0 && flipped && (
        <div className="mt-6">
          <Sources sources={card.sources} />
        </div>
      )}
    </div>
  );
}

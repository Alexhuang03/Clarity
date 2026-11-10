// Répétition espacée : variante de SM-2 (proche d'Anki) avec quatre notes.
// Fonctions pures : aucune dépendance au serveur, testables directement.
import type { IntervalPreview, Rating } from "./types";

export type SrsState = { ease: number; intervalDays: number; repetitions: number; lapses: number };

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL = 365;
/** « À revoir » : la carte revient 10 minutes plus tard */
const RELEARN_DAYS = 10 / (24 * 60);
const DAY_MS = 86_400_000;

const clampEase = (e: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, e));
const round = (d: number) => Math.round(d * 10000) / 10000;

export function nextState(state: SrsState, rating: Rating): SrsState {
  const { ease, intervalDays, repetitions, lapses } = state;
  if (rating === "again") {
    return { ease: clampEase(ease - 0.2), intervalDays: RELEARN_DAYS, repetitions: 0, lapses: lapses + (repetitions > 0 ? 1 : 0) };
  }
  let interval: number;
  let newEase = ease;
  if (repetitions === 0) {
    interval = rating === "easy" ? 4 : 1;
  } else if (repetitions === 1) {
    interval = rating === "hard" ? 2 : rating === "good" ? 4 : 7;
  } else {
    const base = Math.max(1, intervalDays);
    if (rating === "hard") interval = Math.max(base + 1, base * 1.2);
    else if (rating === "good") interval = Math.max(base + 1, base * ease);
    else interval = Math.max(base + 2, base * ease * 1.3);
  }
  if (rating === "hard") newEase = ease - 0.15;
  if (rating === "easy") newEase = ease + 0.15;
  return {
    ease: round(clampEase(newEase)),
    intervalDays: round(Math.min(MAX_INTERVAL, interval)),
    repetitions: repetitions + 1,
    lapses,
  };
}

export function dueDate(intervalDays: number, from = new Date()): Date {
  return new Date(from.getTime() + intervalDays * DAY_MS);
}

/** Intervalle obtenu pour chaque note (affiché sur les boutons de révision). */
export function previewIntervals(state: SrsState): IntervalPreview {
  return {
    again: nextState(state, "again").intervalDays,
    hard: nextState(state, "hard").intervalDays,
    good: nextState(state, "good").intervalDays,
    easy: nextState(state, "easy").intervalDays,
  };
}

/** Score de maîtrise d'une révision (suivi des notions). */
export const RATING_SCORE: Record<Rating, number> = { again: 0, hard: 0.5, good: 0.85, easy: 1 };

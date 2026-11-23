import "server-only";
import { safeError } from "@/lib/security/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConceptMastery, MasteryLevel } from "./types";

export type ConceptEvent = {
  concept: string;
  score: number;
  source: "quiz" | "exam" | "quick" | "flashcard";
  refId?: string | null;
};

const LABEL_MAX = 120;
// Récence : une évaluation perd la moitié de son poids en 14 jours
const HALF_LIFE_DAYS = 14;
// A priori bayésien : une notion jamais évaluée vaut 0,5 avec le poids d'une évaluation
const PRIOR = 0.5;
const PRIOR_WEIGHT = 1;
// Au-delà, les événements les plus anciens ne sont plus lus
const EVENTS_MAX = 3000;

/** Clé stable d'une notion : minuscules, sans accents ni ponctuation superflue. */
export function conceptKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9$\\^_+\-*/=()' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);
}

export async function recordConceptEvents(
  supabase: SupabaseClient,
  courseId: string,
  userId: string,
  events: ConceptEvent[],
) {
  const rows = events
    .map((e) => ({ label: e.concept.trim().slice(0, LABEL_MAX), e }))
    .filter(({ label }) => label && conceptKey(label))
    .map(({ label, e }) => ({
      user_id: userId,
      course_id: courseId,
      concept_key: conceptKey(label),
      concept_label: label,
      score: Math.min(1, Math.max(0, e.score)),
      source: e.source,
      ref_id: e.refId ?? null,
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("study_concept_events").insert(rows);
  // Le suivi n'empêche jamais la correction : on le signale seulement
  if (error) console.error("[révision] suivi des notions non enregistré", safeError(error));
}

export function levelOf(mastery: number): MasteryLevel {
  return mastery < 0.5 ? "faible" : mastery < 0.8 ? "moyen" : "maitrise";
}

/** Maîtrise par notion, de la plus faible à la mieux maîtrisée. */
export async function computeMastery(supabase: SupabaseClient, courseId: string): Promise<ConceptMastery[]> {
  const { data, error } = await supabase
    .from("study_concept_events")
    .select("concept_key, concept_label, score, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(EVENTS_MAX);
  if (error) throw error;
  const now = Date.now();
  const byKey = new Map<string, { label: string; weighted: number; weights: number; count: number; last: string }>();
  for (const e of data ?? []) {
    const ageDays = (now - new Date(e.created_at).getTime()) / 86_400_000;
    const w = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const entry = byKey.get(e.concept_key);
    // Événements du plus récent au plus ancien : le premier libellé rencontré est le plus récent
    if (!entry) byKey.set(e.concept_key, { label: e.concept_label, weighted: w * e.score, weights: w, count: 1, last: e.created_at });
    else {
      entry.weighted += w * e.score;
      entry.weights += w;
      entry.count += 1;
    }
  }
  return [...byKey.entries()]
    .map(([key, e]) => {
      const mastery = Math.round(((e.weighted + PRIOR * PRIOR_WEIGHT) / (e.weights + PRIOR_WEIGHT)) * 1000) / 1000;
      return { key, label: e.label, mastery, level: levelOf(mastery), attempts: e.count, lastSeenAt: e.last };
    })
    .sort((a, b) => a.mastery - b.mastery || b.attempts - a.attempts);
}

/** Notions faibles : maîtrise < 0,6 avec au moins 2 évaluations, sinon les moins maîtrisées (< 0,8). */
export function weakConcepts(concepts: ConceptMastery[], max = 5): ConceptMastery[] {
  const confident = concepts.filter((c) => c.mastery < 0.6 && c.attempts >= 2);
  const pool = confident.length ? confident : concepts.filter((c) => c.mastery < 0.8);
  return pool.slice(0, max);
}

/** Libellés de notions déjà suivies pour le cours (l'IA les réutilise : suivi cohérent d'un quiz à l'autre). */
export async function knownConcepts(supabase: SupabaseClient, courseId: string, max = 40): Promise<string[]> {
  const { data } = await supabase
    .from("study_concept_events")
    .select("concept_key, concept_label")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const seen = new Map<string, string>();
  for (const e of data ?? []) if (!seen.has(e.concept_key)) seen.set(e.concept_key, e.concept_label);
  return [...seen.values()].slice(0, max);
}

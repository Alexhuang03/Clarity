import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTeachCourse } from "./generate";

/**
 * File d'attente du mode professeur : une génération à la fois (même principe que src/lib/ingest/queue.ts),
 * pour ne pas saturer les quotas gratuits. L'état vit dans globalThis (une seule file par serveur Node).
 * La génération continue après la réponse au navigateur ; la page du cours suit le statut du document.
 */
type QueueState = { pending: string[]; queued: Set<string>; running: string | null };

const globalForQueue = globalThis as typeof globalThis & { __clarityTeachQueue?: QueueState };
const state = (globalForQueue.__clarityTeachQueue ??= { pending: [], queued: new Set(), running: null });

export function enqueueTeachCourse(courseId: string) {
  if (state.queued.has(courseId)) return;
  state.queued.add(courseId);
  state.pending.push(courseId);
  void drain();
}

async function drain() {
  if (state.running) return;
  while (state.pending.length > 0) {
    const id = state.pending.shift()!;
    state.running = id;
    try {
      await generateTeachCourse(id);
    } catch (error) {
      console.error("[professeur] erreur inattendue", id, error);
    } finally {
      state.queued.delete(id);
      state.running = null;
    }
  }
}

/** Générations en attente ou en cours sur ce serveur. */
export function teachQueueSize() {
  return state.pending.length + (state.running ? 1 : 0);
}

// Au-delà, une génération restée « en cours » est forcément abandonnée (échéance d'une génération : 10 min)
const STALE_MS = 30 * 60_000;

/**
 * Au démarrage : une génération restée en cours depuis plus de 30 min a été interrompue (redémarrage, plantage).
 * Elle n'est pas relancée (déjà comptée dans les limites, quota consommé) : le document passe en erreur et
 * l'utilisateur peut supprimer le cours et en redemander un. Filtré en SQL (jointure course_web).
 */
export async function failInterruptedTeachCourses() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await admin
    .from("documents")
    .select("id, course_web!inner(course_id)")
    .in("status", ["uploaded", "parsing"])
    .lt("created_at", cutoff)
    .limit(1000);
  if (error) return console.error("[professeur] reprise impossible", error.message);
  const ids = (data ?? []).map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 200) {
    await admin
      .from("documents")
      .update({ status: "error", error: "Génération interrompue. Supprime ce cours et relance-le." })
      .in("id", ids.slice(i, i + 200))
      .in("status", ["uploaded", "parsing"]);
  }
  if (ids.length) console.info(`[professeur] ${ids.length} génération(s) interrompue(s) marquée(s) en erreur`);
}

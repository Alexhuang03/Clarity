import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDocument } from "./pipeline";

/**
 * File d'attente des documents à lire : un seul traitement à la fois, pour ne pas saturer
 * les quotas gratuits de Gemini quand plusieurs fichiers arrivent en même temps.
 *
 * L'état vit dans globalThis : Next.js peut charger ce module plusieurs fois (démarrage,
 * routes, rechargement à chaud en développement), mais il ne doit exister qu'une seule file.
 * Prévu pour un serveur Node qui tourne en continu (pas pour un hébergement serverless).
 */
type QueueState = { pending: string[]; queued: Set<string>; running: string | null };

const globalForQueue = globalThis as typeof globalThis & { __clarityIngestQueue?: QueueState };
const state = (globalForQueue.__clarityIngestQueue ??= { pending: [], queued: new Set(), running: null });

/** Ajoute un document à la file (sans effet s'il y est déjà) et lance le traitement si la file était vide. */
export function enqueueDocument(documentId: string) {
  if (state.queued.has(documentId)) return;
  state.queued.add(documentId);
  state.pending.push(documentId);
  void drain();
}

async function drain() {
  if (state.running) return;
  while (state.pending.length > 0) {
    const id = state.pending.shift()!;
    state.running = id;
    try {
      await processDocument(id);
    } catch (error) {
      // processDocument enregistre déjà ses erreurs sur le document ; ceci est un filet de sécurité
      console.error("[file] erreur inattendue", id, error);
    } finally {
      state.queued.delete(id);
      state.running = null;
    }
  }
}

/**
 * Au démarrage du serveur : rien n'est en cours, donc tout document resté « en lecture »
 * a été interrompu (redémarrage, plantage). On le remet en attente et on reprend la file.
 */
export async function resumeInterruptedDocuments() {
  const admin = createAdminClient();
  const { data: documents, error } = await admin
    .from("documents")
    .select("id, status")
    .in("status", ["uploaded", "parsing"])
    .order("created_at");
  if (error) return console.error("[file] reprise impossible", error.message);
  if (!documents?.length) return;

  const interrupted = documents.filter((d) => d.status === "parsing").map((d) => d.id);
  if (interrupted.length) {
    await admin.from("documents").update({ status: "uploaded", progress: 0 }).in("id", interrupted);
  }
  console.info(`[file] reprise de ${documents.length} document(s) (${interrupted.length} interrompu(s))`);
  documents.forEach((d) => enqueueDocument(d.id));
}

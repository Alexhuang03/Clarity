// Exécuté une fois au démarrage du serveur Next.js
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeInterruptedDocuments } = await import("@/lib/ingest/queue");
  // Sans attendre : la reprise des documents ne doit pas retarder le démarrage du serveur
  void resumeInterruptedDocuments();
}

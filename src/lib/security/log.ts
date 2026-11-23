/**
 * Erreur réduite à ce qui sert au diagnostic, pour les journaux du serveur. Jamais l'objet brut :
 * le champ `details` de Postgres recopie la ligne refusée (« Failing row contains … » : contenu de cours, ids).
 */
export function safeError(error: unknown) {
  if (!error || typeof error !== "object") return { message: "erreur sans détail" };
  const e = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown; stack?: unknown };
  return {
    name: typeof e.name === "string" ? e.name : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
    status: typeof e.status === "number" ? e.status : undefined,
    message: typeof e.message === "string" ? e.message.slice(0, 300) : undefined,
    at: typeof e.stack === "string" ? e.stack.split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 4) : undefined,
  };
}

"use client";

/**
 * Appels à l'API « Révision » (/api/courses/{id}/study/..., voir src/lib/study/API.md).
 * Toutes les erreurs deviennent une StudyApiError au message français prêt à afficher.
 */
export class StudyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** 429 : secondes avant de pouvoir relancer */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

function friendlyMessage(status: number, serverMessage: string | undefined, retryAfter: number | null) {
  if (status === 429) {
    const wait = retryAfter
      ? retryAfter < 90
        ? `dans ${retryAfter} s`
        : `dans ${Math.ceil(retryAfter / 60)} min`
      : "dans un moment";
    return `Tu as lancé beaucoup de générations d'affilée. Fais une petite pause et réessaie ${wait}.`;
  }
  if (serverMessage) return serverMessage;
  if (status === 401) return "Ta session a expiré : reconnecte-toi.";
  if (status === 404) return "Élément introuvable : il a peut-être été supprimé.";
  if (status >= 502) return "L'IA est indisponible ou trop lente pour le moment. Réessaie dans quelques instants.";
  return "Une erreur est survenue. Réessaie.";
}

export async function studyApi<T>(
  courseId: string,
  path: string,
  { method = "GET", body, signal }: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/courses/${courseId}/study${path}`, {
      method,
      signal,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new StudyApiError("Connexion impossible. Vérifie ta connexion internet et réessaie.", 0);
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    const header = Number(response.headers.get("Retry-After"));
    const retryAfter = Number.isFinite(header) && header > 0 ? Math.ceil(header) : null;
    throw new StudyApiError(friendlyMessage(response.status, data?.error, retryAfter), response.status, retryAfter);
  }
  return data as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Une erreur est survenue. Réessaie.";

/** Fin de la journée locale (ISO) : « à réviser aujourd'hui ». */
export function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Intervalle SM-2 lisible : 0.0069 j → « 10 min », 1 → « 1 j », 45 → « 1,5 mois ». */
export function formatInterval(days: number) {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 30) return `${Math.round(days)} j`;
  if (days < 365) return `${(days / 30).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois`;
  return `${(days / 365).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} an`;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

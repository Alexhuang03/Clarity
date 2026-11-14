"use client";

import { currentDictionary } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

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
  const t = currentDictionary();
  const e = t.study.errors;
  if (status === 429) {
    const wait = retryAfter ? (retryAfter < 90 ? e.inSeconds(retryAfter) : e.inMinutes(Math.ceil(retryAfter / 60))) : e.later;
    return e.rateLimit(wait);
  }
  // Message du serveur : déjà dans la langue de l'utilisateur (voir l'API « Révision »)
  if (serverMessage) return serverMessage;
  if (status === 401) return e.session;
  if (status === 404) return e.notFound;
  if (status >= 502) return e.aiDown;
  return t.common.genericError;
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
    throw new StudyApiError(currentDictionary().study.errors.network, 0);
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
  error instanceof Error ? error.message : currentDictionary().common.genericError;

/** Fin de la journée locale (ISO) : « à réviser aujourd'hui ». */
export function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Intervalle SM-2 lisible : 0.0069 j → « 10 min », 1 → « 1 j », 45 → « 1,5 mois ». */
export function formatInterval(days: number, t: Dictionary, intl: string) {
  const i = t.study.interval;
  const one = (n: number) => n.toLocaleString(intl, { maximumFractionDigits: 1 });
  if (days < 1 / 24) return i.minutes(Math.max(1, Math.round(days * 24 * 60)));
  if (days < 1) return i.hours(Math.round(days * 24));
  if (days < 30) return i.days(Math.round(days));
  if (days < 365) return i.months(one(days / 30));
  return i.years(one(days / 365));
}

export const formatDate = (iso: string, intl: string) =>
  new Date(iso).toLocaleDateString(intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

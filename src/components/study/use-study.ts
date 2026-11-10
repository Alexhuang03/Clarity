"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, studyApi } from "./api";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Lecture d'une ressource de l'API « Révision » (GET), rechargeable. path = null : rien à charger.
 * setData permet de mettre la liste à jour localement après une création ou une suppression.
 */
export function useStudyResource<T>(courseId: string, path: string | null) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    studyApi<T>(courseId, path, { signal: controller.signal }).then(
      (data) => setState({ data, error: null, loading: false }),
      (error: unknown) => {
        if ((error as Error).name !== "AbortError") setState((s) => ({ ...s, error: errorMessage(error), loading: false }));
      },
    );
    return () => controller.abort();
  }, [courseId, path, nonce]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setNonce((n) => n + 1);
  }, []);
  const setData = useCallback((update: (data: T | null) => T | null) => {
    setState((s) => ({ ...s, data: update(s.data) }));
  }, []);

  return { ...state, reload, setData };
}

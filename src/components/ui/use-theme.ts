"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/**
 * Thème affiché (attribut data-theme de <html>, posé par le script de layout.tsx et par ThemeToggle).
 * Pour les rares composants qui ne peuvent pas suivre le CSS seul (dessin sur <canvas>, par exemple).
 * Côté serveur : "light" ; le bon thème est lu dès l'hydratation.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light");
}

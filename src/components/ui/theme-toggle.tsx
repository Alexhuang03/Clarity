"use client";

/** Durée du fondu lors du changement de thème */
const FADE_MS = 700;

/**
 * Bouton soleil / lune : passe du thème clair au thème sombre et retient le choix.
 * L'icône affichée dépend seulement du CSS (classes dark:), donc pas d'état React
 * ni de décalage entre le rendu serveur et le navigateur.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    // Les transitions de survol des éléments sont coupées pendant la bascule : sinon chacun
    // ferait son propre fondu, à son rythme, par-dessus celui de la page
    const freeze = document.createElement("style");
    freeze.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(freeze);
    const apply = () => {
      root.dataset.theme = next;
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) {
      // Fondu de toute la page entre l'ancien et le nouveau thème, allongé à FADE_MS
      const transition = document.startViewTransition(apply);
      transition.ready.then(() => {
        for (const animation of root.getAnimations({ subtree: true })) {
          const target = animation.effect as KeyframeEffect | null;
          if (target?.pseudoElement?.startsWith("::view-transition")) {
            target.updateTiming({ duration: FADE_MS, easing: "ease-in-out" });
          }
        }
      });
      transition.finished.finally(() => freeze.remove());
    } else {
      apply();
      requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()));
    }
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour cette page seulement
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Changer de thème (clair / sombre)"
      title="Thème clair / sombre"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 ${className}`}
    >
      {/* Thème clair : lune (passer en sombre) */}
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 dark:hidden">
        <path
          fillRule="evenodd"
          d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
          clipRule="evenodd"
        />
      </svg>
      {/* Thème sombre : soleil (passer en clair) */}
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="hidden h-4 w-4 dark:block">
        <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" />
      </svg>
    </button>
  );
}

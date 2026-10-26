import { ViewTransition } from "react";

/**
 * Glissement horizontal entre l'accueil et un cours (animations dans globals.css).
 * Le sens vient du lien cliqué : transitionTypes={["nav-forward"]} pour entrer dans un cours,
 * ["nav-back"] pour revenir. Les autres navigations (bouton retour du navigateur, rafraîchissement)
 * n'animent rien. À placer dans chaque page.tsx concernée, pas dans un layout : un layout reste
 * affiché d'une page à l'autre, il n'entre ni ne sort.
 */
export function PageSlide({ children }: { children: React.ReactNode }) {
  const slide = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };
  return (
    <ViewTransition enter={slide} exit={slide} default="none">
      {children}
    </ViewTransition>
  );
}

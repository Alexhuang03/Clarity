"use client";

import ShapeGrid from "@/components/reactbits/ShapeGrid";
import { useTheme } from "./use-theme";

/**
 * Fond décoratif : grille fine (ShapeGrid de React Bits) qui s'illumine sous le pointeur.
 * À placer dans un parent `relative` : il le recouvre, derrière le contenu, sans capter les clics.
 * moving = défilement lent en diagonale (pages d'entrée) ; sinon grille immobile, qui ne dessine
 * plus rien quand le pointeur est ailleurs (accueil). Mouvement coupé si prefers-reduced-motion.
 */
export function GridBackground({ moving = false, className = "" }: { moving?: boolean; className?: string }) {
  const dark = useTheme() === "dark";
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
      <ShapeGrid
        shape="square"
        cellSize={44}
        direction={moving ? "diagonal" : "none"}
        speed={moving ? 0.18 : 0}
        lineColor={dark ? "rgba(255,255,255,0.055)" : "rgba(24,24,27,0.06)"}
        hoverColor={dark ? "#818cf8" : "#6366f1"}
        fillOpacity={dark ? 0.1 : 0.06}
        glow={dark ? 0.25 : 0.1}
        trail={0.5}
        clickCascade={false}
        fade={1}
      />
    </div>
  );
}

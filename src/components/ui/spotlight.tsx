"use client";

import SpotlightCard from "@/components/reactbits/SpotlightCard";
import { useTheme } from "./use-theme";

/**
 * Carte à halo (SpotlightCard de React Bits) habillée aux couleurs du thème : surface, bordure
 * et ombre viennent des jetons de globals.css, le halo suit le pointeur (ou le focus clavier).
 */
export function Spotlight({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <SpotlightCard
      theme={theme}
      spotlightColor="var(--spotlight)"
      intensity={theme === "dark" ? 0.14 : 0.35}
      spotlightSize={260}
      borderGlow={0.7}
      proximity={0}
      flare={false}
      className={`rounded-[var(--radius-card)] ${className}`}
      style={
        {
          "--spotlight-card-surface": "var(--surface)",
          "--spotlight-card-border": "var(--line)",
          "--spotlight-card-shadow": "var(--shadow-card)",
        } as React.CSSProperties
      }
      {...rest}
    >
      {children}
    </SpotlightCard>
  );
}

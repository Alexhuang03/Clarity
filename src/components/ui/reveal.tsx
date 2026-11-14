"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Apparition discrète au défilement (fondu + légère montée), à la manière des animations de React Bits.
 * Rendu visible côté serveur (rien de caché sans JavaScript) ; au chargement, seuls les éléments encore
 * sous l'écran sont masqués puis révélés à leur arrivée. Sans effet avec « réduire les animations ».
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Décalage en ms (cartes d'une grille révélées l'une après l'autre) */
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"shown" | "hidden">("shown");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    // Sous l'écran : masqué jusqu'à son arrivée (changement d'état ponctuel, pas une boucle de rendu)
    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-reveal={state}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none data-[reveal=hidden]:translate-y-5 data-[reveal=hidden]:opacity-0 ${className}`}
    >
      {children}
    </Tag>
  );
}

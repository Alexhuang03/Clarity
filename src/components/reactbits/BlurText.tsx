'use client';

/*
 * BlurText — adapted from React Bits (https://reactbits.dev), TS + Tailwind variant.
 * Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-tailwind/TextAnimations/BlurText
 * Copyright (c) 2026 David Haz — MIT + Commons Clause (use in an application allowed; do not redistribute
 * the component on its own). Local changes are noted inline with « Clarity : ».
 *
 * Clarity : version allégée — seul l'effet « blur » est gardé (zoom / tilt / focus / drift, boucle,
 * déclenchement au survol ou au clic retirés), balise choisie avec `as` (titres h1/h2). Si l'utilisateur
 * demande moins de mouvement, la règle .rb-blur-text de globals.css affiche le texte d'emblée (sans écart
 * entre le rendu serveur et le navigateur).
 */

import { motion, type Easing, type Transition } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Snapshot = Record<string, string | number>;

type BlurTextProps = {
  text?: string;
  /** Clarity : balise rendue (p par défaut) */
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'span';
  /** Décalage entre deux mots, en ms */
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
  threshold?: number;
  rootMargin?: string;
  onAnimationComplete?: () => void;
  stepDuration?: number;
  blur?: number;
  distance?: number;
  trigger?: 'view' | 'load';
};

const EASE_LINEAR: Easing = 'linear';
const blurTo = (px: number) => `blur(${Math.max(0, px)}px)`;

const BlurText = ({
  text = '',
  as: Tag = 'p',
  delay = 200,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  onAnimationComplete,
  stepDuration = 0.35,
  blur = 10,
  distance = 50,
  trigger = 'view'
}: BlurTextProps) => {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const completeRef = useRef(onAnimationComplete);
  useEffect(() => {
    completeRef.current = onAnimationComplete;
  });

  const sign = direction === 'bottom' ? 1 : -1;
  const from: Snapshot = useMemo(() => ({ filter: blurTo(blur), opacity: 0, y: sign * distance }), [blur, sign, distance]);
  const keyframes = useMemo(
    () => ({
      filter: [blurTo(blur), blurTo(blur / 2), blurTo(0)],
      opacity: [0, 0.5, 1],
      y: [sign * distance, (-sign * distance) / 10, 0]
    }),
    [blur, sign, distance]
  );

  const pieces = useMemo(() => {
    const words = text.split(' ');
    if (animateBy === 'words') return words.map((w, i) => (i < words.length - 1 ? `${w} ` : w));
    return Array.from(text).map(c => (c === ' ' ? ' ' : c));
  }, [text, animateBy]);

  useEffect(() => {
    if (trigger === 'load') return undefined;
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [trigger, threshold, rootMargin]);

  const active = trigger === 'load' || inView;
  const Component = Tag as 'p';

  const transition = (index: number): Transition => ({
    duration: stepDuration * 2,
    times: [0, 0.5, 1],
    delay: (index * delay) / 1000,
    ease: EASE_LINEAR
  });

  return (
    <Component ref={ref as React.Ref<HTMLParagraphElement>} className={`rb-blur-text flex flex-wrap ${className}`}>
      <span className="sr-only">{text}</span>
      {pieces.map((piece, index) => (
        <motion.span
          aria-hidden="true"
          key={index}
          className="inline-block will-change-[transform,filter,opacity]"
          initial={from}
          animate={active ? keyframes : from}
          transition={transition(index)}
          onAnimationComplete={index === pieces.length - 1 && active ? () => completeRef.current?.() : undefined}
        >
          {piece}
        </motion.span>
      ))}
    </Component>
  );
};

export default BlurText;

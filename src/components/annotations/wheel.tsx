"use client";

import { useEffect, useState } from "react";
import { HIGHLIGHT_COLORS, HIGHLIGHT_SWATCH, type HighlightColor } from "@/lib/annotations/types";
import { pingIconUrl, type PingAction, type PingDef } from "@/lib/annotations/lol";

// Roues de pings et d'émotes, reprises de lolPing (MIT) : on maintient le déclencheur
// (clic droit, Alt ou Ctrl), on glisse vers une part, on relâche.

export type WheelItem = { key: string; label: string; icon: string; color: string; round?: boolean };
export type WheelHit = { index: number; color?: HighlightColor };

export const PING_ORDER: PingAction[] = ["question", "understanding", "error", "highlight"];

export const PING_LABELS: Record<PingAction, string> = {
  question: "Poser une question",
  understanding: "Ce que j'ai compris",
  error: "Signaler une erreur",
  highlight: "Surligner",
};

/** Parts de la roue de pings, avec le ping choisi pour chaque action. */
export const buildPingItems = (pings: Record<PingAction, PingDef>): WheelItem[] =>
  PING_ORDER.map((action) => ({
    key: action,
    label: PING_LABELS[action],
    icon: pingIconUrl(pings[action].icon),
    color: pings[action].color,
  }));

const INNER = 38; // en deçà du rayon intérieur : annuler
const COLOR_GAP = 12; // au-delà de la roue + cet écart : couronne de couleurs (surlignage)
const COLOR_OFFSETS: Record<HighlightColor, number> = { yellow: -33, green: -11, pink: 11, blue: 33 };

type Geometry = { size: number; outer: number; icon: number };
const geometry = (count: number): Geometry => (count > 4 ? { size: 320, outer: 132, icon: 46 } : { size: 290, outer: 108, icon: 40 });

/** Angle (degrés, 0 = droite, sens horaire) du centre de la part i sur n, la première étant en haut. */
const sliceCenter = (i: number, n: number) => -90 + (i * 360) / n;

/**
 * Part visée par le pointeur (décalage par rapport au centre).
 * colorSlice : index de la part qui porte la couronne de couleurs (surlignage).
 */
export function hitTest(dx: number, dy: number, count: number, colorSlice: number | null, lastColor: HighlightColor): WheelHit | null {
  const distance = Math.hypot(dx, dy);
  if (distance < INNER) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const step = 360 / count;
  const index = (((Math.round((angle + 90) / step) % count) + count) % count);
  if (index !== colorSlice) return { index };
  if (distance <= geometry(count).outer + COLOR_GAP) return { index, color: lastColor };
  // Dans la couronne : la pastille de couleur la plus proche
  const center = sliceCenter(index, count);
  const rel = ((angle - center + 540) % 360) - 180;
  const color = HIGHLIGHT_COLORS.reduce((best, c) =>
    Math.abs(COLOR_OFFSETS[c] - rel) < Math.abs(COLOR_OFFSETS[best] - rel) ? c : best,
  );
  return { index, color };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function Wheel({
  x,
  y,
  items,
  hit,
  colorSlice = null,
  lastColor,
  interactive,
  ariaLabel,
  onPick,
  onHover,
  footer,
}: {
  x: number;
  y: number;
  items: WheelItem[];
  hit: WheelHit | null;
  colorSlice?: number | null;
  lastColor: HighlightColor;
  /** Mode clic : les parts sont cliquables (sinon glisser-relâcher, piloté par le pointeur) */
  interactive: boolean;
  ariaLabel: string;
  onPick: (hit: WheelHit) => void;
  onHover: (hit: WheelHit | null) => void;
  footer?: React.ReactNode;
}) {
  const { size, outer, icon } = geometry(items.length);
  const c = size / 2;
  const n = items.length;
  const step = 360 / n;
  const point = (r: number, deg: number) => [c + r * Math.cos(rad(deg)), c + r * Math.sin(rad(deg))];
  const sector = (i: number) => {
    const from = sliceCenter(i, n) - step / 2 + 1.5;
    const to = sliceCenter(i, n) + step / 2 - 1.5;
    const inner = INNER + 4;
    const [x1, y1] = point(outer, from);
    const [x2, y2] = point(outer, to);
    const [x3, y3] = point(inner, to);
    const [x4, y4] = point(inner, from);
    return `M${x1} ${y1} A${outer} ${outer} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${inner} ${inner} 0 0 0 ${x4} ${y4} Z`;
  };
  // La roue reste entièrement visible près des bords de l'écran
  const left = Math.min(Math.max(x, c), window.innerWidth - c);
  const top = Math.min(Math.max(y, c), window.innerHeight - c);
  const label = hit ? items[hit.index].label : interactive ? "Choisis" : "Annuler";

  return (
    <div
      className="pointer-events-none fixed z-50 animate-[wheel-in_120ms_ease-out]"
      style={{ left: left - c, top: top - c, width: size, height: size }}
      role="menu"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} className="drop-shadow-2xl" style={{ pointerEvents: interactive ? "auto" : "none" }}>
        <defs>
          <radialGradient id="wheel-bg">
            <stop offset="0%" stopColor="#0a1016" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#101a22" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        {items.map((item, i) => {
          const active = hit?.index === i;
          const [ix, iy] = point((INNER + outer) / 2 + 2, sliceCenter(i, n));
          const choose = (): WheelHit => ({ index: i, color: i === colorSlice ? lastColor : undefined });
          return (
            <g
              key={item.key}
              role="menuitem"
              aria-label={item.label}
              className={interactive ? "cursor-pointer" : undefined}
              onPointerEnter={() => interactive && onHover(choose())}
              onPointerLeave={() => interactive && onHover(null)}
              onClick={() => interactive && onPick(choose())}
            >
              <path
                d={sector(i)}
                fill={active ? item.color : "url(#wheel-bg)"}
                fillOpacity={active ? 0.55 : 1}
                stroke={active ? item.color : "#463714"}
                strokeWidth={active ? 2.5 : 1.5}
                style={{ transition: "fill-opacity 80ms" }}
              />
              {/* Icône ternie au repos, en couleur et agrandie quand la part est visée (comme lolPing) */}
              <image
                href={item.icon}
                x={ix - icon / 2}
                y={iy - icon / 2}
                width={icon}
                height={icon}
                style={{
                  clipPath: item.round ? "circle(50%)" : undefined,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transform: active ? "scale(1.18)" : "none",
                  filter: active || item.round ? "none" : "grayscale(1) sepia(.75) saturate(1.3) brightness(1.15)",
                  transition: "transform 100ms, filter 100ms",
                  pointerEvents: "none",
                }}
              />
            </g>
          );
        })}

        {/* Couronne des couleurs de surlignage autour de la part « Surligner » */}
        {colorSlice !== null &&
          HIGHLIGHT_COLORS.map((color) => {
            const [cx, cy] = point(outer + 24, sliceCenter(colorSlice, n) + COLOR_OFFSETS[color]);
            const selected = hit?.index === colorSlice ? hit.color === color : color === lastColor;
            return (
              <circle
                key={color}
                cx={cx}
                cy={cy}
                r={selected ? 11 : 8}
                fill={HIGHLIGHT_SWATCH[color]}
                stroke={selected ? "#f0e6d2" : "#0a1016"}
                strokeWidth={selected ? 3 : 2}
                className={interactive ? "cursor-pointer" : undefined}
                style={{ transition: "r 80ms" }}
                role="menuitem"
                aria-label={`Surligner en ${color}`}
                onPointerEnter={() => interactive && onHover({ index: colorSlice, color })}
                onClick={() => interactive && onPick({ index: colorSlice, color })}
              />
            );
          })}

        <circle cx={c} cy={c} r={INNER} fill="#0a1016" stroke="#785a28" strokeWidth={2} />
      </svg>
      <div
        className="absolute left-1/2 top-1/2 w-[4.5rem] -translate-x-1/2 -translate-y-1/2 text-center text-[0.6rem] font-semibold uppercase leading-tight tracking-wide text-[#1fa9e0]"
        aria-live="polite"
      >
        {label}
      </div>
      {footer && <div className="pointer-events-auto absolute left-1/2 top-full -translate-x-1/2 -translate-y-6">{footer}</div>}
    </div>
  );
}

/** Ping à l'endroit annoté : anneaux, halo au sol et icône qui rebondit (animation de lolPing). */
export function PingFx({ x, y, ping: def }: { x: number; y: number; ping: PingDef }) {
  return (
    <div className="lol-ping" style={{ left: x, top: y, "--c": def.color } as React.CSSProperties} aria-hidden>
      <div className="ground" />
      <div className="ring" />
      <div className="ring r2" />
      <div className="art">
        <div className="pop">
          {/* eslint-disable-next-line @next/next/no-img-element -- petite icône animée, pas besoin d'optimisation */}
          <img src={pingIconUrl(def.icon)} alt="" />
        </div>
      </div>
    </div>
  );
}

// Les images animées partagent leur horloge dans Chromium : chaque apparition reçoit sa propre
// URL (comme dans lolPing) pour que l'animation reparte du début.
const animations = new Map<string, Promise<Blob>>();

/** Précharge l'animation d'une émote (appelé quand elle est visée dans la roue). */
export function preloadEmote(url: string) {
  if (!animations.has(url)) {
    const blob = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
    // Échec (hors ligne…) : on réessaiera à la prochaine apparition
    blob.catch(() => animations.delete(url));
    animations.set(url, blob);
  }
}

/** Émote animée qui apparaît puis disparaît à l'endroit annoté. */
export function EmoteFx({ x, y, url: source }: { x: number; y: number; url: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    preloadEmote(source);
    animations.get(source)!.then(
      (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {}, // animation indisponible : seul le son est joué
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  return (
    <div className="lol-emote" style={{ left: x, top: y }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- animation WebP jouée une fois */}
      {url && <img src={url} alt="" />}
    </div>
  );
}

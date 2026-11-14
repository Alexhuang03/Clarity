"use client";

import { useEffect, useRef } from "react";
import { pingIconUrl, type PingAction, type PingDef } from "@/lib/annotations/lol";
import { HIGHLIGHT_SWATCH, isThreadKind, type AnnotationRow } from "@/lib/annotations/types";
import { useT } from "@/lib/i18n/client";
import { BubblePreview, type Pending } from "./threads";

// Fermer en glissant vers le bas : au-delà de cette distance, le panneau se ferme
const CLOSE_DRAG = 90;

/**
 * Panneau qui monte du bas de l'écran (mobile, ou fenêtre trop étroite pour la marge).
 * Se ferme en touchant à côté, avec Échap, ou en tirant la poignée vers le bas.
 */
export function BottomSheet({
  title,
  onBack,
  onClose,
  children,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const { t } = useT();

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const move = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const end = () => {
    if (!drag.current || !panel.current) return;
    const closing = drag.current.dy > CLOSE_DRAG;
    drag.current = null;
    if (closing) onClose();
    else panel.current.style.transform = "";
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/15"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerUp={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-label={title}
        data-sheet
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[75dvh] w-full max-w-xl animate-[sheet-up_180ms_ease-out] flex-col rounded-t-2xl border border-b-0 border-black/10 bg-[var(--background)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(0_0_0/0.18)] transition-transform dark:border-white/15"
      >
        {/* Poignée : tirer vers le bas pour fermer */}
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center px-4 pb-2 pt-2 active:cursor-grabbing"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, dy: 0 };
            if (panel.current) panel.current.style.transition = "none";
          }}
          onPointerMove={move}
          onPointerUp={() => {
            if (panel.current) panel.current.style.transition = "";
            end();
          }}
          onPointerCancel={end}
        >
          <span className="h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
          <div className="mt-2 flex w-full items-center gap-2">
            {onBack && (
              <button type="button" onClick={onBack} onPointerDown={(e) => e.stopPropagation()} className="rounded-lg px-1.5 py-0.5 text-sm text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400">
                ← {t.common.back}
              </button>
            )}
            <span className="flex-1 truncate text-sm font-semibold">{title}</span>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-lg px-2 py-0.5 text-lg leading-none opacity-50 hover:opacity-100"
              aria-label={t.annotations.closePanel}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </>
  );
}

/** Liste d'annotations (toutes celles du cours, ou celles qui se chevauchent à un endroit). */
export function AnnotationList({
  annotations,
  pings,
  pending,
  onPick,
}: {
  annotations: AnnotationRow[];
  pings: Record<PingAction, PingDef>;
  pending: Record<string, Pending>;
  onPick: (a: AnnotationRow) => void;
}) {
  const { t } = useT();
  if (!annotations.length) {
    return <p className="py-6 text-center text-sm opacity-60">{t.annotations.noDiscussion}</p>;
  }
  return (
    <ul className="space-y-2">
      {annotations.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onPick(a)}
            className={`w-full rounded-xl border border-l-[3px] border-black/10 p-2.5 text-left transition hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/5 ${
              a.status !== "open" ? "opacity-60" : ""
            }`}
            style={{ borderLeftColor: isThreadKind(a.kind) ? pings[a.kind].color : a.kind === "highlight" ? HIGHLIGHT_SWATCH[a.color ?? "yellow"] : undefined }}
          >
            {isThreadKind(a.kind) ? (
              <>
                <BubblePreview annotation={a} ping={pings[a.kind]} pending={pending[a.id]} />
                <p className="mt-1 line-clamp-1 text-xs italic opacity-50">{t.annotations.quote(a.anchor.quote)}</p>
              </>
            ) : (
              <span className="flex items-center gap-2">
                {a.kind === "highlight" ? (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: HIGHLIGHT_SWATCH[a.color ?? "yellow"] }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- icône du ping
                  <img src={pingIconUrl(pings.highlight.icon)} alt="" className="h-4 w-4" />
                )}
                <span className="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">{t.annotations.kind[a.kind]}</span>
                <span className="line-clamp-1 flex-1 text-sm italic">{t.annotations.quote(a.anchor.quote)}</span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

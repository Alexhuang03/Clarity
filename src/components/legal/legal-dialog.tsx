"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { LEGAL_TABS, LegalContent, type LegalTab } from "./content";

const ICONS: Record<LegalTab, React.ReactNode> = {
  cgu: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
  confidentialite: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9.5 12l1.8 1.8L15 10" />,
  mentions: <path d="M12 4v16M8 20h8M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0zM19 8l-2.5 6a2.5 2.5 0 0 0 5 0z" />,
  licence: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5a3.5 3.5 0 1 0 0 5" /></>,
};

function Icon({ tab, className = "" }: { tab: LegalTab; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 ${className}`} aria-hidden>
      {ICONS[tab]}
    </svg>
  );
}

/** Textes juridiques rédigés en français : mention « version française faisant foi » dans les autres langues. */
export function LegalFrenchNote() {
  const { t } = useT();
  if (!t.legal.frenchNote) return null;
  return (
    <p className="mb-5 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-text">
      {t.legal.frenchNote}
    </p>
  );
}

/** Onglets + contenu, réutilisés dans la fenêtre et sur la page /legal. */
export function LegalTabs({ tab, onTab }: { tab: LegalTab; onTab: (t: LegalTab) => void }) {
  const { t: dict } = useT();
  function onKeyDown(e: React.KeyboardEvent) {
    const i = LEGAL_TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = LEGAL_TABS[(next + LEGAL_TABS.length) % LEGAL_TABS.length].id;
    onTab(t);
    document.getElementById(`legal-tab-${t}`)?.focus();
  }
  return (
    <div role="tablist" aria-label={dict.legal.tablist} onKeyDown={onKeyDown} className="grid grid-cols-2 border-b border-line px-2 sm:grid-cols-4 sm:px-4">
      {LEGAL_TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            id={`legal-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="legal-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => onTab(t.id)}
            title={dict.legal.tabs[t.id].label}
            className={`relative flex min-w-0 items-center justify-center gap-2 px-1 py-2.5 text-sm sm:py-3 transition-colors ${
              active ? "font-medium text-accent-text" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon tab={t.id} />
            <span className="truncate">{dict.legal.tabs[t.id].short}</span>
            {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

export function LegalDialog({
  open,
  initialTab = "cgu",
  onClose,
}: {
  open: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<LegalTab>(initialTab);
  const [openedWith, setOpenedWith] = useState<LegalTab | null>(null);
  const { t } = useT();

  // Rouvrir la fenêtre sur l'onglet demandé (lien « Conditions » ou « Confidentialité »)
  if (open && openedWith !== initialTab) {
    setOpenedWith(initialTab);
    setTab(initialTab);
  }
  if (!open && openedWith !== null) setOpenedWith(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function changeTab(t: LegalTab) {
    setTab(t);
    panelRef.current?.scrollTo({ top: 0 });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // clic sur le fond
      }}
      aria-labelledby="legal-title"
      className="legal-dialog m-auto w-[min(44rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-0 text-foreground shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(85vh,48rem)] flex-col">
        <header className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <Icon tab="mentions" className="h-[18px] w-[18px]" />
          </span>
          <h2 id="legal-title" className="flex-1 font-display text-xl italic">
            {t.legal.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <LegalTabs tab={tab} onTab={changeTab} />
        <div
          ref={panelRef}
          id="legal-panel"
          role="tabpanel"
          aria-labelledby={`legal-tab-${tab}`}
          tabIndex={0}
          className="legal-scroll flex-1 overflow-y-auto px-4 py-5 outline-none sm:px-6"
        >
          <LegalFrenchNote />
          <LegalContent tab={tab} />
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
          <a href="/legal" target="_blank" rel="noopener" className="text-xs text-muted underline-offset-4 hover:text-foreground hover:underline">
            {t.legal.openNewTab}
          </a>
          <button type="button" onClick={onClose} className="btn btn-primary">
            {t.legal.understood}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

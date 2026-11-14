"use client";

import { useEffect, useState } from "react";
import ShinyText from "@/components/reactbits/ShinyText";
import { Markdown } from "@/components/course/markdown";
import { SourcesList } from "@/components/course/source-chip";
import { useTheme } from "@/components/ui/use-theme";
import { useT } from "@/lib/i18n/client";
import type { Source, StudyScope } from "@/lib/study/types";

/** Parties et documents prêts du cours, pour choisir le périmètre d'une génération. */
export type ScopeOptions = {
  parts: { id: string; title: string; ordinal: number }[];
  documents: { id: string; filename: string }[];
};

// ------------------------------------------------------------------ Textes (Markdown + LaTeX)

/** Texte généré (énoncé, choix, explication) : Markdown compact avec formules KaTeX. */
export function Md({ text, sources, className = "" }: { text: string; sources?: Source[]; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Markdown content={text} sources={sources} variant="bubble" />
    </div>
  );
}

/** Sources d'une question / carte, numérotées dans l'ordre. */
export function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return <SourcesList sources={sources.map((source, i) => ({ source, number: i + 1 }))} />;
}

// ------------------------------------------------------------------ États

function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setSeconds(0);
    };
  }, [active]);
  return seconds;
}

/**
 * Génération par l'IA en cours (10 à 90 s, sans flux) : libellé qui scintille (ShinyText),
 * chronomètre et squelette du contenu à venir.
 */
export function Generating({ label, hint }: { label?: string; hint?: string }) {
  const dark = useTheme() === "dark";
  const { t } = useT();
  const seconds = useElapsed(true);
  return (
    <div role="status" aria-live="polite" className="card rise-in p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <ShinyText
          text={label ?? t.study.generating}
          color={dark ? "#a1a1aa" : "#71717a"}
          shineColor={dark ? "#ffffff" : "#18181b"}
          speed={1.8}
          shineWidth={30}
          className="font-medium"
        />
        <span className="ml-auto text-sm tabular-nums text-muted">{t.study.seconds(seconds)}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {hint ?? t.study.generatingHint}
      </p>
      <div className="mt-6 space-y-3" aria-hidden>
        {[92, 78, 85, 60].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  const { t } = useT();
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-danger">
      <span aria-hidden className="mt-px">⚠</span>
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-medium underline-offset-4 hover:underline">
          {t.common.retry}
        </button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Mise en page

export function ToolIntro({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {children && <p className="mt-2 text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h3>;
}

// ------------------------------------------------------------------ Contrôles

/** Choix exclusif compact (difficulté, durée...). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            value === o.value ? "bg-surface font-medium shadow-card" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pastille à cocher (types de questions, parties du cours...). */
export function Chip({
  checked,
  onChange,
  children,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
        checked
          ? "border-accent/50 bg-accent-soft text-accent-text"
          : "border-line text-muted hover:border-line-strong hover:text-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[0.55rem] ${
          checked ? "border-accent bg-accent text-accent-foreground" : "border-line-strong"
        }`}
      >
        {checked && "✓"}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {label}
        {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

/** Périmètre d'une génération : tout le cours, ou certaines parties / certains documents. */
export function ScopePicker({
  options,
  value,
  onChange,
}: {
  options: ScopeOptions;
  value: StudyScope;
  onChange: (scope: StudyScope) => void;
}) {
  const partIds = value.partIds ?? [];
  const documentIds = value.documentIds ?? [];
  const whole = partIds.length === 0 && documentIds.length === 0;
  const { t } = useT();
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  if (options.parts.length === 0 && options.documents.length <= 1) return null;
  return (
    <Field label={t.study.scopeLabel} hint={whole ? t.study.scopeWhole : t.study.scopeSelection}>
      <div className="flex flex-wrap gap-2">
        <Chip checked={whole} onChange={() => onChange({})}>
          {t.study.wholeCourse}
        </Chip>
        {options.parts.map((p) => (
          <Chip
            key={p.id}
            checked={partIds.includes(p.id)}
            onChange={(on) => onChange({ partIds: toggle(partIds, p.id, on), documentIds })}
            title={p.title}
          >
            {p.ordinal + 1}. {p.title}
          </Chip>
        ))}
        {options.documents.length > 1 &&
          options.documents.map((d) => (
            <Chip
              key={d.id}
              checked={documentIds.includes(d.id)}
              onChange={(on) => onChange({ partIds, documentIds: toggle(documentIds, d.id, on) })}
              title={d.filename}
            >
              📄 {d.filename.replace(/\.[^.]+$/, "")}
            </Chip>
          ))}
      </div>
    </Field>
  );
}

/** Bouton de suppression en deux temps (pas de fenêtre de confirmation). */
export function DeleteButton({ onDelete, label: labelProp }: { onDelete: () => Promise<void> | void; label?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useT();
  const label = labelProp ?? t.common.delete;
  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        aria-label={label}
        title={label}
        className="rounded-lg p-2 text-muted transition hover:bg-red-500/10 hover:text-danger"
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h12M8 6V4h4v2m-6 0 .6 10h6.8L14 6" />
        </svg>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setConfirm(false)}>
      <button
        type="button"
        autoFocus
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onDelete();
          } finally {
            setBusy(false);
            setConfirm(false);
          }
        }}
        className="btn bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-500"
      >
        {busy ? "…" : label}
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="btn btn-ghost px-2 py-1 text-xs">
        {t.common.cancel}
      </button>
    </span>
  );
}

/** Note en % avec couleur selon le niveau. */
export function scoreTone(percent: number | null) {
  if (percent === null) return "text-muted";
  if (percent >= 80) return "text-success";
  if (percent >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-danger";
}

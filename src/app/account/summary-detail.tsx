"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { setSummaryDetail } from "./summary-actions";

export type SummaryDetail = "concis" | "detaille" | "tres_detaille";

const LEVELS: SummaryDetail[] = ["concis", "detaille", "tres_detaille"];

/** Niveau de détail des résumés (user_settings.summary_detail), enregistré dès le choix. */
export function SummaryDetailSetting({ initial }: { initial: SummaryDetail }) {
  const { t } = useT();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(next: SummaryDetail) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setSummaryDetail(next).catch(() => ({ error: t.common.genericError }));
      if (result.error) {
        setValue(previous);
        setError(result.error);
      } else setSaved(true);
    });
  }

  return (
    <div className="mt-4">
      <div role="radiogroup" aria-label={t.account.detailTitle} className="grid gap-2 sm:grid-cols-3">
        {LEVELS.map((level) => {
          const checked = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={pending}
              onClick={() => choose(level)}
              className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-wait ${
                checked ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <span className={`block text-sm font-medium ${checked ? "text-accent-text" : ""}`}>
                {t.account.detail[level].label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{t.account.detail[level].text}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-4 text-xs" aria-live="polite">
        {error ? <span className="text-danger">{error}</span> : saved ? <span className="text-muted">✓ {t.account.saved}</span> : null}
      </p>
    </div>
  );
}

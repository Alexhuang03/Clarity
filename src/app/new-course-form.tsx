"use client";

import { useActionState, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { createCourse } from "./courses/actions";

const inputClass = "field";

/** Dernière case de la grille : une tuile « Nouveau cours » qui s'ouvre en formulaire. */
export function NewCourseForm({ subjects }: { subjects: string[] }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const [state, formAction, pending] = useActionState(createCourse, { error: null });

  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-full min-h-16 w-full items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong text-sm text-muted transition hover:border-accent/60 hover:bg-accent-soft hover:text-accent-text sm:min-h-40 sm:flex-col sm:gap-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-xl leading-none shadow-card transition group-hover:scale-105 group-hover:border-accent/40">
            +
          </span>
          {t.dashboard.newCourse}
        </button>
      </li>
    );
  }

  return (
    <li className="sm:col-span-2 lg:col-span-3">
      <form
        action={formAction}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="card rise-in space-y-4 p-5"
      >
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="space-y-1.5">
            <span className="text-sm text-muted">{t.dashboard.titleLabel}</span>
            <input
              name="title"
              required
              autoFocus
              maxLength={120}
              placeholder={t.dashboard.titlePlaceholder}
              className={inputClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm text-muted">{t.dashboard.subjectOptional}</span>
            <input name="subject" list="subjects" maxLength={60} placeholder={t.dashboard.subjectPlaceholder} className={inputClass} />
            <datalist id="subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? t.dashboard.creating : t.dashboard.createCourse}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn btn-ghost"
          >
            {t.common.cancel}
          </button>
          {state.error && <p className="ml-auto text-sm text-danger">{state.error}</p>}
        </div>
      </form>
    </li>
  );
}

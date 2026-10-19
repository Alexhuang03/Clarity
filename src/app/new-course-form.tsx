"use client";

import { useActionState, useState } from "react";
import { createCourse } from "./courses/actions";

const inputClass =
  "w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 outline-none transition placeholder:opacity-40 focus:border-indigo-500 dark:border-white/15";

/** Dernière case de la grille : une tuile « Nouveau cours » qui s'ouvre en formulaire. */
export function NewCourseForm({ subjects }: { subjects: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCourse, { error: null });

  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-full min-h-16 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-black/15 text-sm opacity-60 transition hover:border-indigo-500 hover:text-indigo-600 hover:opacity-100 dark:border-white/15 dark:hover:text-indigo-300 sm:min-h-40 sm:flex-col sm:gap-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-xl leading-none transition group-hover:bg-indigo-500/10 dark:bg-white/10">
            +
          </span>
          Nouveau cours
        </button>
      </li>
    );
  }

  return (
    <li className="sm:col-span-2 lg:col-span-3">
      <form
        action={formAction}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="space-y-4 rounded-2xl border border-black/10 p-5 dark:border-white/10"
      >
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="space-y-1.5">
            <span className="text-sm opacity-60">Titre</span>
            <input
              name="title"
              required
              autoFocus
              maxLength={120}
              placeholder="Ex. Probabilités – chapitre 3"
              className={inputClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm opacity-60">Matière (facultatif)</span>
            <input name="subject" list="subjects" maxLength={60} placeholder="Ex. Maths" className={inputClass} />
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending ? "Création…" : "Créer le cours"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-2 text-sm opacity-60 transition hover:opacity-100"
          >
            Annuler
          </button>
          {state.error && <p className="ml-auto text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        </div>
      </form>
    </li>
  );
}

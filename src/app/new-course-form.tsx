"use client";

import { useActionState, useState } from "react";
import { createCourse } from "./courses/actions";

export function NewCourseForm({ subjects }: { subjects: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCourse, { error: null });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
      >
        + Nouveau cours
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-3 rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="space-y-1">
          <span className="text-sm font-medium">Titre</span>
          <input
            name="title"
            required
            autoFocus
            maxLength={120}
            placeholder="Ex. Probabilités – chapitre 3"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Matière (facultatif)</span>
          <input
            name="subject"
            list="subjects"
            maxLength={60}
            placeholder="Ex. Maths"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20"
          />
          <datalist id="subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer le cours"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 opacity-70 hover:opacity-100">
          Annuler
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

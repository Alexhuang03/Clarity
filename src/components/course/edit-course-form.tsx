"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCourse } from "@/app/courses/actions";

const inputClass =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20";

/** Formulaire de modification du titre et de la matière d'un cours. */
export function EditCourseForm({
  courseId,
  title,
  subject,
  subjects,
  onDone,
}: {
  courseId: string;
  title: string;
  subject: string | null;
  subjects: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const listId = useId();
  const [newTitle, setNewTitle] = useState(title);
  const [newSubject, setNewSubject] = useState(subject ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unchanged = newTitle.trim() === title && newSubject.trim() === (subject ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (unchanged) return onDone();
    startTransition(async () => {
      const result = await updateCourse(courseId, { title: newTitle, subject: newSubject });
      if (result.error) return setError(result.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="@container w-full space-y-3"
    >
      {/* Requête de conteneur : champs côte à côte seulement si le formulaire est assez large */}
      <div className="grid gap-3 @md:grid-cols-[2fr_1fr]">
        <label className="space-y-1">
          <span className="text-sm font-medium">Titre</span>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            autoFocus
            maxLength={120}
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Matière</span>
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            list={listId}
            maxLength={60}
            placeholder="Aucune"
            className={inputClass}
          />
          <datalist id={listId}>
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={pending || !newTitle.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg px-4 py-2 text-sm opacity-70 hover:opacity-100">
          Annuler
        </button>
        {newSubject && (
          <button
            type="button"
            onClick={() => setNewSubject("")}
            className="ml-auto text-sm opacity-60 hover:opacity-100"
            title="Retirer la matière"
          >
            Retirer la matière
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { deleteCourse } from "./courses/actions";

export function DeleteCourseButton({
  courseId,
  title,
  className = "rounded-lg px-3 py-1.5 text-sm opacity-60 hover:bg-red-500/10 hover:text-red-600 hover:opacity-100 disabled:opacity-30",
  children,
}: {
  courseId: string;
  title: string;
  className?: string;
  /** Contenu du bouton (ex. une icône) ; par défaut le mot « Supprimer » */
  children?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Supprimer le cours « ${title} », ses fichiers et ses résumés ? Cette action est irréversible.`)) {
          startTransition(() => deleteCourse(courseId));
        }
      }}
      aria-label={`Supprimer le cours ${title}`}
      aria-busy={pending}
      title="Supprimer"
      className={className}
    >
      {children ?? (pending ? "Suppression…" : "Supprimer")}
    </button>
  );
}

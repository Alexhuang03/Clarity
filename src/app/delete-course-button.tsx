"use client";

import { useTransition } from "react";
import { deleteCourse } from "../actions";

export function DeleteCourseButton({
  courseId,
  title,
  className = "rounded-lg px-3 py-1.5 text-sm opacity-60 hover:bg-red-500/10 hover:text-red-600 hover:opacity-100 disabled:opacity-30",
}: {
  courseId: string;
  title: string;
  className?: string;
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
      className={className}
    >
      {pending ? "Suppression…" : "Supprimer"}
    </button>
  );
}

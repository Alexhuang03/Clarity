"use client";

import { useTransition } from "react";
import { useT } from "@/lib/i18n/client";
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
  const { t } = useT();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(t.dashboard.deleteConfirm(title))) {
          startTransition(() => deleteCourse(courseId));
        }
      }}
      aria-label={t.dashboard.deleteCourse(title)}
      aria-busy={pending}
      title={t.common.delete}
      className={className}
    >
      {children ?? (pending ? t.dashboard.deleting : t.common.delete)}
    </button>
  );
}

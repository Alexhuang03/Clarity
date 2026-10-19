"use client";

import Link from "next/link";
import { useState } from "react";
import { EditCourseForm } from "@/components/course/edit-course-form";

export function CourseCard({
  id,
  title,
  subject,
  subjects,
  documentCount,
  createdAt,
}: {
  id: string;
  title: string;
  subject: string | null;
  subjects: string[];
  documentCount: number;
  createdAt: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="h-full rounded-2xl border border-indigo-500 p-5">
        <EditCourseForm
          courseId={id}
          title={title}
          subject={subject}
          subjects={subjects}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="group relative h-full">
      <Link
        href={`/courses/${id}`}
        className="block h-full rounded-2xl border border-black/10 p-5 pr-12 transition hover:border-indigo-500 hover:shadow-sm dark:border-white/15"
      >
        {subject && (
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            {subject}
          </span>
        )}
        <p className="mt-1 font-medium">{title}</p>
        <p className="mt-2 text-sm opacity-60">
          {documentCount} document{documentCount > 1 ? "s" : ""} ·{" "}
          {new Date(createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </p>
      </Link>
      {/* Bouton hors du lien : visible au survol sur ordinateur, toujours visible sur écran tactile */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Modifier le cours ${title}`}
        title="Modifier le titre ou la matière"
        className="absolute right-3 top-3 rounded-lg bg-black/5 p-2 opacity-70 transition hover:bg-indigo-500/15 hover:text-indigo-600 hover:opacity-100 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:bg-white/10 dark:hover:text-indigo-300"
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
        </svg>
      </button>
    </div>
  );
}

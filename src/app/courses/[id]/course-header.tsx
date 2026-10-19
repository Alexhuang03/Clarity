"use client";

import Link from "next/link";
import { useState } from "react";
import { EditCourseForm } from "@/components/course/edit-course-form";
import { DeleteCourseButton } from "./delete-course-button";

export function CourseHeader({
  courseId,
  title,
  subject,
  subjects,
}: {
  courseId: string;
  title: string;
  subject: string | null;
  subjects: string[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <header className="mx-auto flex w-full max-w-3xl items-start gap-3 px-4 py-6">
      <Link href="/" className="mt-1 text-sm opacity-60 hover:opacity-100" aria-label="Retour à mes cours">
        ←
      </Link>
      {editing ? (
        <EditCourseForm
          courseId={courseId}
          title={title}
          subject={subject}
          subjects={subjects}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            {subject && (
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                {subject}
              </p>
            )}
            <h1 className="truncate text-xl font-semibold" title={title}>
              {title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg px-3 py-1.5 text-sm opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
          >
            Modifier
          </button>
          <DeleteCourseButton courseId={courseId} title={title} />
        </>
      )}
    </header>
  );
}

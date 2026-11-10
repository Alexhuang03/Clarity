"use client";

import Link from "next/link";
import { useState } from "react";
import { EditCourseForm } from "@/components/course/edit-course-form";
import { Spotlight } from "@/components/ui/spotlight";
import { ShareButton, ShareIcon } from "@/components/course/share-dialog";
import { DeleteCourseButton } from "./delete-course-button";

const ICON_BASE = "rounded-lg p-2 text-muted transition hover:text-foreground";
const ICON_BUTTON = `${ICON_BASE} hover:bg-surface-2`;

export function CourseCard({
  id,
  title,
  subject,
  subjectColor,
  subjects,
  documentCount,
  createdAt,
}: {
  id: string;
  title: string;
  subject: string | null;
  subjectColor: string | null;
  subjects: string[];
  documentCount: number;
  createdAt: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="card h-full !border-accent/50 p-5">
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
      <Spotlight className="h-full transition duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:shadow-pop">
        <Link
          href={`/courses/${id}`}
          transitionTypes={["nav-forward"]}
          className="flex h-full min-h-40 flex-col rounded-[inherit] p-5 focus-visible:outline-offset-[-2px]"
        >
          <span className="flex h-5 items-center gap-2 pr-24 text-xs text-muted">
            {subject && (
              <>
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: subjectColor ?? "var(--accent)" }}
                />
                <span className="truncate">{subject}</span>
              </>
            )}
          </span>
          <p className="mt-3 line-clamp-2 text-[0.95rem] font-medium leading-snug">{title}</p>
          <p className="mt-auto flex items-center justify-between pt-6 text-xs text-muted">
            <span>
              {documentCount} document{documentCount > 1 ? "s" : ""} ·{" "}
              {new Date(createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>
            <span
              aria-hidden
              className="translate-x-[-4px] opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100"
            >
              →
            </span>
          </p>
        </Link>
      </Spotlight>
      {/* Boutons hors du lien : visibles au survol sur ordinateur, toujours visibles sur écran tactile */}
      <div className="absolute right-2.5 top-2.5 z-10 flex transition focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <ShareButton courseId={id} title={title} className={ICON_BUTTON}>
          <ShareIcon />
        </ShareButton>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Modifier le cours ${title}`}
          title="Modifier le titre ou la matière"
          className={ICON_BUTTON}
        >
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
          </svg>
        </button>
        <DeleteCourseButton
          courseId={id}
          title={title}
          className={`${ICON_BASE} hover:bg-red-500/10 hover:text-danger disabled:animate-pulse`}
        >
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </DeleteCourseButton>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseRow, DocumentRow, MessageRow, PartRow } from "@/lib/course/types";
import { Workspace } from "@/components/course/workspace";
import { DeleteCourseButton } from "./delete-course-button";

export default function CoursePage({ params }: PageProps<"/courses/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<div className="mx-auto mt-16 h-8 w-64 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />}>
        <CourseContent params={params} />
      </Suspense>
    </main>
  );
}

async function CourseContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: course }, { data: documents }, { data: parts }, { data: messages }] = await Promise.all([
    supabase.from("courses").select("id, title, analyzed_at, subject:subjects(name, color)").eq("id", id).maybeSingle(),
    supabase
      .from("documents")
      .select("id, filename, kind, mime_type, status, progress, page_count, error, created_at")
      .eq("course_id", id)
      .order("created_at"),
    supabase.from("course_parts").select("id, ordinal, title").eq("course_id", id).order("ordinal"),
    supabase
      .from("messages")
      .select("id, role, kind, part_id, content, sources, created_at")
      .eq("course_id", id)
      .order("created_at"),
  ]);
  if (!course) notFound();

  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-6">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100" aria-label="Retour à mes cours">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{course.title}</h1>
          {course.subject && <p className="text-sm opacity-60">{(course.subject as unknown as { name: string }).name}</p>}
        </div>
        <DeleteCourseButton courseId={course.id} title={course.title} />
      </header>
      <Workspace
        course={course as unknown as CourseRow}
        userId={user.id}
        initialDocuments={(documents ?? []) as DocumentRow[]}
        initialParts={(parts ?? []) as PartRow[]}
        initialMessages={(messages ?? []) as MessageRow[]}
      />
    </>
  );
}

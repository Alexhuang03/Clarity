import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseRow, DocumentRow, MessageRow, PartRow } from "@/lib/course/types";
import type { AnnotationRow } from "@/lib/annotations/types";
import { Workspace } from "@/components/course/workspace";

export default function CoursePage({ params }: PageProps<"/courses/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense
        fallback={<div className="mx-auto mt-16 h-8 w-64 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />}
      >
        <CourseContent params={params} />
      </Suspense>
    </main>
  );
}

async function CourseContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: course }, { data: documents }, { data: parts }, { data: messages }, { data: annotations }] = await Promise.all([
    supabase.from("courses").select("id, title, analyzed_at, subject:subjects(name, color)").eq("id", id).maybeSingle(),
    supabase
      .from("documents")
      .select("id, filename, kind, mime_type, status, progress, page_count, error, created_at")
      .eq("course_id", id)
      .order("created_at"),
    supabase.from("course_parts").select("id, ordinal, title").eq("course_id", id).order("ordinal"),
    supabase
      .from("messages")
      .select("id, role, kind, part_id, content, sources, thinking, thinking_ms, created_at")
      .eq("course_id", id)
      .order("created_at"),
    // Annotations des réponses de ce cours (avec leur fil de discussion)
    supabase
      .from("annotations")
      .select(
        "id, message_id, kind, color, anchor, note, emote, status, created_at, thread_messages(id, role, content, created_at), messages!inner(course_id)",
      )
      .eq("messages.course_id", id)
      .order("created_at"),
  ]);
  if (!course) notFound();

  return (
    <Workspace
      course={course as unknown as CourseRow}
      userId={user.id}
      initialDocuments={(documents ?? []) as DocumentRow[]}
      initialParts={(parts ?? []) as PartRow[]}
      initialMessages={(messages ?? []) as MessageRow[]}
      initialAnnotations={(annotations ?? []) as unknown as AnnotationRow[]}
    />
  );
}

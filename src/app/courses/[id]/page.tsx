import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseRow, DocumentRow, MessageRow, PartRow } from "@/lib/course/types";
import { Workspace } from "@/components/course/workspace";
import { CourseHeader } from "./course-header";

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

  const [{ data: course }, { data: documents }, { data: parts }, { data: messages }, { data: subjects }] = await Promise.all([
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
    supabase.from("subjects").select("name").order("name"),
  ]);
  if (!course) notFound();

  return (
    <>
      <CourseHeader
        courseId={course.id}
        title={course.title}
        subject={(course.subject as unknown as { name: string } | null)?.name ?? null}
        subjects={(subjects ?? []).map((s) => s.name)}
      />
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

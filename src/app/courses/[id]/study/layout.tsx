import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StudyNav, StudyNavSkeleton } from "@/components/study/study-nav";
import { PageSlide } from "@/components/ui/page-slide";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Espace « Réviser » d'un cours : barre (retour au cours, titre, onglets des outils) commune à
 * toutes les pages de study/. La barre reste en place d'un onglet à l'autre ; seul le contenu change.
 */
export default function StudyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <PageSlide>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <div className="flex items-center gap-3 py-3">
              <Suspense fallback={<div className="h-10 w-56 animate-pulse rounded-lg bg-surface-2" />}>
                <StudyTitle params={params} />
              </Suspense>
              <ThemeToggle />
            </div>
            <Suspense fallback={<StudyNavSkeleton />}>
              <StudyNav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">{children}</main>
      </div>
    </PageSlide>
  );
}

async function StudyTitle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCurrentUser();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("title, subject:subjects(name)")
    .eq("id", id)
    .maybeSingle();
  if (!course) notFound();
  const subject = (course.subject as unknown as { name: string } | null)?.name;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Link
        href={`/courses/${id}`}
        transitionTypes={["nav-back"]}
        aria-label="Retour au cours"
        className="btn btn-ghost shrink-0 px-2.5 py-1.5"
      >
        <span aria-hidden>←</span>
        <span className="hidden sm:inline">Cours</span>
      </Link>
      <div className="min-w-0 border-l border-line pl-3">
        <p className="eyebrow truncate">Réviser{subject ? ` · ${subject}` : ""}</p>
        <h1 className="truncate text-base font-semibold sm:text-lg" title={course.title}>
          {course.title}
        </h1>
      </div>
    </div>
  );
}

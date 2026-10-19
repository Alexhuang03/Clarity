import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { CourseCard } from "./course-card";
import { NewCourseForm } from "./new-course-form";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white"
          >
            C
          </span>
          Clarity
        </Link>
        <Suspense fallback={<div className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/10" />}>
          <UserMenu />
        </Suspense>
      </header>

      <main className="pb-16 pt-10 sm:pt-16">
        <Suspense fallback={<CoursesSkeleton />}>
          <Courses />
        </Suspense>
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center gap-1 text-sm">
      {/* Sur mobile, la déconnexion se fait depuis « Mon compte » */}
      <form action={signOut} className="hidden sm:block">
        <button className="rounded-lg px-3 py-1.5 opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
          Se déconnecter
        </button>
      </form>
      <Link
        href="/account"
        title={`Mon compte (${user.email})`}
        aria-label="Mon compte"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.06] text-xs font-semibold uppercase transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
      >
        {user.email.charAt(0) || "?"}
      </Link>
    </div>
  );
}

async function Courses() {
  await getCurrentUser();
  const supabase = await createClient();
  const [{ data: courses }, { data: subjects }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, created_at, subject:subjects(name, color), documents(count)")
      .order("created_at", { ascending: false }),
    supabase.from("subjects").select("name").order("name"),
  ]);

  const subjectNames = (subjects ?? []).map((s) => s.name);
  const count = courses?.length ?? 0;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mes cours</h1>
        <p className="mt-2 opacity-55">
          {count === 0
            ? "Crée ton premier cours et ajoute tes fichiers : l'IA en fera un résumé clair, pas à pas."
            : `${count} cours${subjectNames.length ? ` · ${subjectNames.length} matière${subjectNames.length > 1 ? "s" : ""}` : ""}`}
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {courses?.map((course) => {
          const subject = course.subject as unknown as { name: string; color: string } | null;
          return (
            <li key={course.id}>
              <CourseCard
                id={course.id}
                title={course.title}
                subject={subject?.name ?? null}
                subjectColor={subject?.color ?? null}
                subjects={subjectNames}
                documentCount={(course.documents as unknown as { count: number }[])[0]?.count ?? 0}
                createdAt={course.created_at}
              />
            </li>
          );
        })}
        <NewCourseForm subjects={subjectNames} />
      </ul>
    </>
  );
}

function CoursesSkeleton() {
  return (
    <>
      <div className="mb-8 h-10 w-48 animate-pulse rounded-lg bg-black/5 dark:bg-white/[0.06]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-black/[0.03] dark:bg-white/[0.04]" />
        ))}
      </div>
    </>
  );
}

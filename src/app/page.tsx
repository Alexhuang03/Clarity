import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { NewCourseForm } from "./new-course-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mes cours</h1>
        <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />}>
          <UserMenu />
        </Suspense>
      </header>
      <Suspense fallback={<div className="mt-10 h-40 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />}>
        <Courses />
      </Suspense>
    </main>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <Link href="/account" className="hidden opacity-70 hover:underline hover:opacity-100 sm:inline" title="Mon compte">
        {user.email}
      </Link>
      <Link href="/account" className="opacity-70 hover:opacity-100 sm:hidden">
        Compte
      </Link>
      <button className="rounded-lg border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
        Se déconnecter
      </button>
    </form>
  );
}

async function Courses() {
  await getCurrentUser();
  const supabase = await createClient();
  const [{ data: courses }, { data: subjects }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, created_at, subject:subjects(name), documents(count), messages(count)")
      .order("created_at", { ascending: false }),
    supabase.from("subjects").select("name").order("name"),
  ]);

  return (
    <div className="mt-8 space-y-6">
      <NewCourseForm subjects={(subjects ?? []).map((s) => s.name)} />
      {!courses?.length ? (
        <p className="opacity-70">
          Aucun cours pour l&apos;instant. Crée ton premier cours, puis ajoute tes fichiers : l&apos;IA t&apos;en fera un
          résumé détaillé.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {courses.map((course) => {
            const subject = course.subject as unknown as { name: string } | null;
            const docCount = (course.documents as unknown as { count: number }[])[0]?.count ?? 0;
            return (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className="block h-full rounded-2xl border border-black/10 p-5 transition hover:border-indigo-500 hover:shadow-sm dark:border-white/15"
                >
                  {subject && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                      {subject.name}
                    </span>
                  )}
                  <p className="mt-1 font-medium">{course.title}</p>
                  <p className="mt-2 text-sm opacity-60">
                    {docCount} document{docCount > 1 ? "s" : ""} ·{" "}
                    {new Date(course.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

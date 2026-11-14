import Link from "next/link";
import { Suspense } from "react";
import BlurText from "@/components/reactbits/BlurText";
import CountUp from "@/components/reactbits/CountUp";
import { GridBackground } from "@/components/ui/grid-background";
import { Logo } from "@/components/ui/logo";
import { PageSlide } from "@/components/ui/page-slide";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { CourseCard } from "./course-card";
import { NewCourseForm } from "./new-course-form";
import { TeachForm } from "./teach-form";

export default function Home() {
  return (
    <PageSlide>
      <div className="relative isolate flex flex-1 flex-col overflow-x-clip">
        {/* Grille décorative en haut de page, fondue vers le bas */}
        <GridBackground className="bottom-auto h-[30rem] [mask-image:linear-gradient(to_bottom,black_30%,transparent)]" />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
          <header className="flex items-center justify-between py-5">
            <Logo />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Suspense fallback={<div className="h-8 w-8 rounded-full bg-surface-2" />}>
                <UserMenu />
              </Suspense>
            </div>
          </header>

          <main className="pb-16 pt-10 sm:pt-16">
            <Suspense fallback={<CoursesSkeleton />}>
              <Courses />
            </Suspense>
          </main>
        </div>
      </div>
    </PageSlide>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  const { t } = await getT();
  return (
    <div className="flex items-center gap-1 text-sm">
      {/* Sur mobile, la déconnexion se fait depuis « Mon compte » */}
      <form action={signOut} className="hidden sm:block">
        <button className="btn btn-ghost px-3 py-1.5 font-normal">
          {t.common.signOut}
        </button>
      </form>
      <Link
        href="/account"
        title={t.dashboard.accountTitle(user.email)}
        aria-label={t.common.myAccount}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold uppercase shadow-card transition hover:border-line-strong"
      >
        {user.email.charAt(0) || "?"}
      </Link>
    </div>
  );
}

async function Courses() {
  await getCurrentUser();
  const { t } = await getT();
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
  const documentTotal = (courses ?? []).reduce(
    (sum, c) => sum + ((c.documents as unknown as { count: number }[])[0]?.count ?? 0),
    0,
  );

  return (
    <>
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-3">{t.dashboard.eyebrow}</p>
          <BlurText
            key={t.dashboard.title}
            as="h1"
            text={t.dashboard.title}
            trigger="load"
            delay={90}
            distance={18}
            className="text-4xl font-semibold tracking-tight sm:text-5xl"
          />
          <p className="mt-3 max-w-md text-muted">
            {count === 0 ? t.dashboard.introEmpty : t.dashboard.intro}
          </p>
        </div>
        {count > 0 && (
          <dl className="flex gap-8 sm:gap-10">
            <Stat value={count} label={t.dashboard.statCourses(count)} />
            <Stat value={subjectNames.length} label={t.dashboard.statSubjects(subjectNames.length)} />
            <Stat value={documentTotal} label={t.dashboard.statDocuments(documentTotal)} />
          </dl>
        )}
      </div>
      {/* Mode professeur : un cours rédigé à partir d'un simple sujet, à côté de l'import de fichiers */}
      <TeachForm />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {courses?.map((course, i) => {
          const subject = course.subject as unknown as { name: string; color: string } | null;
          return (
            <li key={course.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="text-3xl font-semibold tabular-nums tracking-tight">
        <CountUp to={value} duration={1.2} trigger="load" />
      </dd>
      <dd aria-hidden className="mt-0.5 text-xs text-muted">
        {label}
      </dd>
    </div>
  );
}

function CoursesSkeleton() {
  return (
    <>
      <div className="mb-10 h-24 w-64 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        ))}
      </div>
    </>
  );
}

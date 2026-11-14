import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MessageRow, PartRow } from "@/lib/course/types";
import { COURSE_FRAME, COURSE_MARGIN } from "@/components/course/layout";
import { OutlineButton } from "@/components/course/outline-button";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SharedConversation } from "./shared-conversation";

type SharedCourse = {
  title: string;
  subject: { name: string; color: string } | null;
  shared_at: string;
  parts: PartRow[];
  messages: MessageRow[];
};

// Page publique : accessible avec le lien, connecté ou non (voir OPEN_PATHS dans le proxy)
export default function SharePage({ params }: PageProps<"/share/[token]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense
        fallback={<div className="mx-auto mt-16 h-8 w-64 animate-pulse rounded-lg bg-surface-2" />}
      >
        <SharedContent params={params} />
      </Suspense>
    </main>
  );
}

async function SharedContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_course", { p_token: token });
  const course = data as SharedCourse | null;
  if (!course) notFound();
  const { t, intl } = await getT();

  return (
    <>
      <div className={COURSE_FRAME}>
        <div aria-hidden className={`hidden xl:block ${COURSE_MARGIN}`} />
        <header className="flex items-start gap-3 py-6">
          <div className="min-w-0 flex-1">
            <Logo className="mb-6 text-sm" />
            {course.subject && <p className="eyebrow">{course.subject.name}</p>}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{course.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {t.share.sharedOnLong(
                new Date(course.shared_at).toLocaleDateString(intl, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              )}
            </p>
          </div>
          <OutlineButton messages={course.messages} parts={course.parts} />
          <LanguageSwitcher compact />
          <ThemeToggle />
        </header>
      </div>

      <SharedConversation
        parts={course.parts}
        messages={course.messages}
        footer={
          <div className="card relative isolate mb-6 overflow-hidden p-8 text-center">
            <div
              aria-hidden
              className="absolute left-1/2 top-0 -z-10 h-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
            />
            <p className="font-display text-2xl italic">{t.share.ctaTitle}</p>
            <p className="mt-2 text-sm text-muted">{t.share.ctaText}</p>
            <Link href="/" className="btn btn-primary mt-5">
              {t.share.ctaButton}
            </Link>
          </div>
        }
      />
    </>
  );
}

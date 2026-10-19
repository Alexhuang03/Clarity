import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MessageRow, PartRow } from "@/lib/course/types";
import { COURSE_FRAME, COURSE_MARGIN } from "@/components/course/layout";
import { OutlineButton } from "@/components/course/outline-button";
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
        fallback={<div className="mx-auto mt-16 h-8 w-64 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />}
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

  return (
    <>
      <div className={COURSE_FRAME}>
        <div aria-hidden className={`hidden xl:block ${COURSE_MARGIN}`} />
        <header className="flex items-start gap-3 py-6">
          <div className="min-w-0 flex-1">
            {course.subject && (
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                {course.subject.name}
              </p>
            )}
            <h1 className="text-xl font-semibold">{course.title}</h1>
            <p className="mt-1 text-sm opacity-60">
              Cours partagé le{" "}
              {new Date(course.shared_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · lecture seule
            </p>
          </div>
          <OutlineButton messages={course.messages} parts={course.parts} />
        </header>
      </div>

      <SharedConversation
        parts={course.parts}
        messages={course.messages}
        footer={
          <div className="mb-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
            <p className="font-medium">Révise tes propres cours avec Clarity</p>
            <p className="mt-1 text-sm opacity-70">
              Uploade tes cours et tes exos : l&apos;IA t&apos;en fait un résumé détaillé.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
            >
              Essayer Clarity
            </Link>
          </div>
        }
      />
    </>
  );
}

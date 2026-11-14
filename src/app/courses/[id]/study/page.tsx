import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import BlurText from "@/components/reactbits/BlurText";
import { StudyStats } from "@/components/study/study-stats";
import { STUDY_TOOLS } from "@/components/study/tools";
import { Spotlight } from "@/components/ui/spotlight";
import { getT } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.course.revise} · Clarity` };
}

/** Vue d'ensemble de l'espace « Réviser » : un accès à chaque outil. */
export default async function StudyHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  return (
    <div className="py-10 sm:py-14">
      <div className="mb-10 max-w-xl">
        <BlurText
          key={t.study.hubTitle}
          as="h2"
          text={t.study.hubTitle}
          trigger="load"
          delay={80}
          distance={16}
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        />
        <p className="mt-3 text-muted">{t.study.hubText}</p>
      </div>
      <Suspense fallback={<ToolGrid t={t} />}>
        <ToolLinks params={params} t={t} />
      </Suspense>
    </div>
  );
}

async function ToolLinks({ params, t }: { params: Promise<{ id: string }>; t: Dictionary }) {
  const { id } = await params;
  return (
    <div className="space-y-12">
      <ToolGrid courseId={id} t={t} />
      <section>
        <h3 className="mb-4 text-lg font-semibold tracking-tight">{t.study.progressTitle}</h3>
        <StudyStats courseId={id} />
      </section>
    </div>
  );
}

function ToolGrid({ courseId, t }: { courseId?: string; t: Dictionary }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {STUDY_TOOLS.map((tool, i) => {
        const body = (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent-text transition group-hover:border-accent/40">
              {tool.icon}
            </span>
            <span className="mt-5 flex items-center gap-1.5 font-medium">
              {t.study.tools[tool.slug].label}
              <span
                aria-hidden
                className="text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
              >
                →
              </span>
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">{t.study.tools[tool.slug].tagline}</span>
          </>
        );
        return (
          <li key={tool.slug} className="rise-in" style={{ animationDelay: `${i * 50}ms` }}>
            <Spotlight className="h-full">
              {courseId ? (
                <Link
                  href={`/courses/${courseId}/study/${tool.slug}`}
                  className="group block h-full rounded-[inherit] p-5 focus-visible:outline-offset-[-2px]"
                >
                  {body}
                </Link>
              ) : (
                <div className="h-full p-5">{body}</div>
              )}
            </Spotlight>
          </li>
        );
      })}
    </ul>
  );
}

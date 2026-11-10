import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import BlurText from "@/components/reactbits/BlurText";
import { StudyStats } from "@/components/study/study-stats";
import { STUDY_TOOLS } from "@/components/study/tools";
import { Spotlight } from "@/components/ui/spotlight";

export const metadata: Metadata = { title: "Réviser · Clarity" };

/** Vue d'ensemble de l'espace « Réviser » : un accès à chaque outil. */
export default function StudyHubPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="py-10 sm:py-14">
      <div className="mb-10 max-w-xl">
        <BlurText
          as="h2"
          text="Révise à ton rythme."
          trigger="load"
          delay={80}
          distance={16}
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        />
        <p className="mt-3 text-muted">
          Quiz, flashcards, fiches, examens blancs : choisis un outil, Clarity le prépare à partir de ton cours.
        </p>
      </div>
      <Suspense fallback={<ToolGrid />}>
        <ToolLinks params={params} />
      </Suspense>
    </div>
  );
}

async function ToolLinks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-12">
      <ToolGrid courseId={id} />
      <section>
        <h3 className="mb-4 text-lg font-semibold tracking-tight">Ta progression</h3>
        <StudyStats courseId={id} />
      </section>
    </div>
  );
}

function ToolGrid({ courseId }: { courseId?: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {STUDY_TOOLS.map((tool, i) => (
        <li key={tool.slug} className="rise-in" style={{ animationDelay: `${i * 50}ms` }}>
          <Spotlight className="h-full">
            {courseId ? (
              <Link href={`/courses/${courseId}/study/${tool.slug}`} className="group block h-full rounded-[inherit] p-5 focus-visible:outline-offset-[-2px]">
                <ToolCardBody tool={tool} />
              </Link>
            ) : (
              <div className="h-full p-5">
                <ToolCardBody tool={tool} />
              </div>
            )}
          </Spotlight>
        </li>
      ))}
    </ul>
  );
}

function ToolCardBody({ tool }: { tool: (typeof STUDY_TOOLS)[number] }) {
  return (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent-text transition group-hover:border-accent/40">
        {tool.icon}
      </span>
      <span className="mt-5 flex items-center gap-1.5 font-medium">
        {tool.label}
        <span
          aria-hidden
          className="text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
        >
          →
        </span>
      </span>
      <span className="mt-1 block text-sm leading-relaxed text-muted">{tool.tagline}</span>
    </>
  );
}

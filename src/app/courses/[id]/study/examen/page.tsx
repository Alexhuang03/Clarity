import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { NoDocuments } from "@/components/study/no-documents";
import { ExamTool } from "@/components/study/quiz-tools";
import { loadScopeOptions, ToolSkeleton } from "../scope-options";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.study.tools["examen"].label} · Clarity` };
}

export default function MockExamPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="py-10 sm:py-12">
      <Suspense fallback={<ToolSkeleton />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scopeOptions = await loadScopeOptions(id);
  if (scopeOptions.documents.length === 0) return <NoDocuments slug="examen" courseId={id} />;
  return <ExamTool courseId={id} scopeOptions={scopeOptions} />;
}

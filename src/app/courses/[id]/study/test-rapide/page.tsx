import type { Metadata } from "next";
import { Suspense } from "react";
import { NoDocuments } from "@/components/study/no-documents";
import { QuickTestTool } from "@/components/study/quiz-tools";
import { loadScopeOptions, ToolSkeleton } from "../scope-options";

export const metadata: Metadata = { title: "Test rapide · Clarity" };

export default function QuickTestPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (scopeOptions.documents.length === 0) return <NoDocuments slug="test-rapide" courseId={id} />;
  return <QuickTestTool courseId={id} />;
}

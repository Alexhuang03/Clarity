import type { Metadata } from "next";
import { Suspense } from "react";
import { NoDocuments } from "@/components/study/no-documents";
import { MindMapTool } from "@/components/study/mindmap-tool";
import { loadScopeOptions, ToolSkeleton } from "../scope-options";

export const metadata: Metadata = { title: "Carte mentale · Clarity" };

export default function MindMapPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (scopeOptions.documents.length === 0) return <NoDocuments slug="mindmap" courseId={id} />;
  return <MindMapTool courseId={id} scopeOptions={scopeOptions} />;
}

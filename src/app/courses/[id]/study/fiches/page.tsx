import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { NoDocuments } from "@/components/study/no-documents";
import { SheetsTool } from "@/components/study/sheets-tool";
import { loadScopeOptions, ToolSkeleton } from "../scope-options";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.study.tools["fiches"].label} · Clarity` };
}

export default function FichesPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (scopeOptions.documents.length === 0) return <NoDocuments slug="fiches" courseId={id} />;
  return <SheetsTool courseId={id} scopeOptions={scopeOptions} />;
}

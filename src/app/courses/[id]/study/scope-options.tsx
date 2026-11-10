import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ScopeOptions } from "@/components/study/ui";

/** Parties du cours et documents prêts : choix du périmètre des générations (RLS : cours de l'utilisateur). */
export async function loadScopeOptions(courseId: string): Promise<ScopeOptions> {
  await getCurrentUser();
  const supabase = await createClient();
  const [{ data: parts }, { data: documents }] = await Promise.all([
    supabase.from("course_parts").select("id, ordinal, title").eq("course_id", courseId).order("ordinal"),
    supabase.from("documents").select("id, filename").eq("course_id", courseId).eq("status", "ready").order("created_at"),
  ]);
  return { parts: parts ?? [], documents: documents ?? [] };
}

/** Squelette commun pendant le chargement d'un outil. */
export function ToolSkeleton() {
  return (
    <div className="py-10" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-8 h-56 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
    </div>
  );
}

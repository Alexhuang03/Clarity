import "server-only";
import { modelChain } from "@/lib/ai/models";
import { loadScopedContent, type CourseContext } from "./content";
import { dbError, enforceStudyLimit, scopeSchema, type Session } from "./http";
import { generateJson, StudyError } from "./llm";
import { mindmapPrompt } from "./prompts";
import type { CreateMindMapRequest, MindMap, MindMapNode, MindMapSummary, StudyScope } from "./types";
import { fixLatexEscapes, v, type Schema } from "./validate";

const BUDGET = 45_000;
const LIST_MAX = 100;
const MAX_DEPTH = 4;
const MAX_CHILDREN = 10;
const MAX_NODES = 80;
const COLUMNS = "id, title, scope, tree, model, created_at";

export const createMindMapSchema: Schema<CreateMindMapRequest> = v.object({
  scope: scopeSchema,
  title: v.optional(v.string({ max: 200 })),
});

/**
 * Arbre renvoyé par l'IA → arbre propre : identifiants recalculés ("n0", "n0.1", "n0.1.2"...),
 * profondeur, nombre d'enfants et de nœuds limités, nœuds sans libellé retirés.
 */
export function normalizeTree(raw: unknown): MindMapNode | null {
  let count = 0;
  const walk = (node: unknown, id: string, depth: number): MindMapNode | null => {
    if (typeof node !== "object" || node === null || count >= MAX_NODES) return null;
    const n = node as { label?: unknown; summary?: unknown; children?: unknown };
    const label = typeof n.label === "string" ? fixLatexEscapes(n.label.trim()).slice(0, 80) : "";
    if (!label) return null;
    count += 1;
    const summary = typeof n.summary === "string" && n.summary.trim() ? fixLatexEscapes(n.summary.trim()).slice(0, 300) : undefined;
    const children: MindMapNode[] = [];
    if (depth < MAX_DEPTH && Array.isArray(n.children)) {
      for (const child of n.children.slice(0, MAX_CHILDREN)) {
        const c = walk(child, `${id}.${children.length + 1}`, depth + 1);
        if (c) children.push(c);
      }
    }
    return { id, label, ...(summary ? { summary } : {}), children };
  };
  return walk(raw, "n0", 1);
}

const treeSchema: Schema<{ title: string; root: MindMapNode }> = (input, path) => {
  const obj = (typeof input === "object" && input !== null ? input : {}) as { title?: unknown; root?: unknown };
  const root = normalizeTree(obj.root ?? input);
  if (!root || root.children.length < 2) return { ok: false, error: `${path || "réponse"} : arbre trop pauvre (racine avec au moins 2 branches attendue)` };
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim().slice(0, 150) : root.label;
  return { ok: true, value: { title, root } };
};

type Row = { id: string; title: string; scope: StudyScope; tree: MindMapNode; model: string | null; created_at: string };
const toSummary = (r: Omit<Row, "tree" | "model">): MindMapSummary => ({ id: r.id, title: r.title, scope: r.scope, createdAt: r.created_at });
const toMindMap = (r: Row): MindMap => ({ ...toSummary(r), tree: r.tree, model: r.model });

export async function createMindMap(session: Session & { ctx: CourseContext }, body: CreateMindMapRequest): Promise<MindMap> {
  const scope = body.scope ?? {};
  const content = await loadScopedContent(session.supabase, session.ctx, scope, BUDGET);
  await enforceStudyLimit(session.userId);
  const { value, model } = await generateJson(
    modelChain("study"),
    { system: mindmapPrompt(), user: content.block, maxTokens: 6144, temperature: 0.3, beforeRetry: () => enforceStudyLimit(session.userId) },
    treeSchema,
    "carte mentale",
  );
  const { data, error } = await session.supabase
    .from("study_mindmaps")
    .insert({
      user_id: session.userId,
      course_id: session.courseId,
      title: (body.title ?? value.title).slice(0, 200),
      scope,
      tree: value.root,
      model,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) dbError(error);
  return toMindMap(data as Row);
}

export async function listMindMaps({ supabase, courseId }: Session): Promise<MindMapSummary[]> {
  const { data, error } = await supabase
    .from("study_mindmaps")
    .select("id, title, scope, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(LIST_MAX);
  if (error) dbError(error);
  return (data ?? []).map(toSummary);
}

export async function getMindMap({ supabase, courseId }: Session, id: string): Promise<MindMap> {
  const { data, error } = await supabase.from("study_mindmaps").select(COLUMNS).eq("id", id).eq("course_id", courseId).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Carte mentale introuvable", 404);
  return toMindMap(data as Row);
}

export async function deleteMindMap({ supabase, courseId }: Session, id: string) {
  const { data, error } = await supabase.from("study_mindmaps").delete().eq("id", id).eq("course_id", courseId).select("id");
  if (error) dbError(error);
  if (!data?.length) throw new StudyError("Carte mentale introuvable", 404);
}

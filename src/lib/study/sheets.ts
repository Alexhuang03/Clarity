import "server-only";
import { modelChain } from "@/lib/ai/models";
import type { Source } from "@/lib/course/sources";
import { loadScopedContent, pickSources, type CourseContext } from "./content";
import { dbError, enforceStudyLimit, scopeSchema, type Session } from "./http";
import { generateJson, StudyError } from "./llm";
import { sheetPrompt } from "./prompts";
import type { CreateSheetRequest, Sheet, SheetData, SheetSummary, StudyScope } from "./types";
import { fixLatexEscapes, parse, v, type Schema } from "./validate";

const BUDGET = 50_000;
const LIST_MAX = 100;
const COLUMNS = "id, title, scope, data, content, model, created_at, updated_at";

export const createSheetSchema: Schema<CreateSheetRequest> = v.object({
  scope: scopeSchema,
  title: v.optional(v.string({ max: 200 })),
});

const item = <S extends Record<string, Schema<unknown>>>(shape: S) => v.array(v.object(shape), { dropInvalid: true, max: 30 });
const t = (max: number) => v.string({ max });

const sheetSchema = v.object({
  title: v.lenient(t(150), "Fiche de révision"),
  summary: v.string({ min: 20, max: 3000 }),
  keyConcepts: v.refine(item({ term: t(150), explanation: t(1500) }), (a) => (a.length ? null : "aucune notion clé")),
  definitions: v.lenient(item({ term: t(150), definition: t(1500) }), []),
  formulas: v.lenient(item({ name: t(150), latex: t(600), explanation: v.lenient(t(1000), "") }), []),
  pitfalls: v.lenient(v.array(t(800), { dropInvalid: true, max: 15 }), []),
  sources: v.lenient(v.array(v.number({ int: true }), { dropInvalid: true, max: 30 }), []),
});

type SheetRow = {
  id: string;
  title: string;
  scope: StudyScope;
  data: SheetData;
  content: string;
  model: string | null;
  created_at: string;
  updated_at: string;
};

const toSummary = (s: Omit<SheetRow, "data" | "content" | "model">): SheetSummary => ({
  id: s.id,
  title: s.title,
  scope: s.scope,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});
const toSheet = (s: SheetRow): Sheet => ({ ...toSummary(s), data: s.data, content: s.content, model: s.model });

/** Fiche structurée → markdown (formules entre $...$, rendues par KaTeX côté interface). */
export function sheetMarkdown(d: SheetData): string {
  const out: string[] = [`# ${d.title}`, "", "## En bref", "", d.summary];
  if (d.keyConcepts.length) out.push("", "## Notions clés", "", ...d.keyConcepts.map((c) => `- **${c.term}** : ${c.explanation}`));
  if (d.definitions.length) out.push("", "## Définitions", "", ...d.definitions.map((c) => `- **${c.term}** : ${c.definition}`));
  if (d.formulas.length) {
    out.push("", "## Formules", "");
    for (const f of d.formulas) out.push(`- **${f.name}** : $${f.latex}$${f.explanation ? `  \n  ${f.explanation}` : ""}`);
  }
  if (d.pitfalls.length) out.push("", "## Pièges à éviter", "", ...d.pitfalls.map((p) => `- ${p}`));
  if (d.sources.length) {
    out.push("", "## Sources", "", ...d.sources.map((s) => `- ${s.filename}${s.page ? `, page ${s.page}` : ""}${s.section ? ` — ${s.section}` : ""}`));
  }
  return out.join("\n");
}

async function generate(session: Session & { ctx: CourseContext }, scope: StudyScope) {
  const content = await loadScopedContent(session.supabase, session.ctx, scope, BUDGET);
  await enforceStudyLimit(session.userId);
  const { value, model } = await generateJson(
    modelChain("study"),
    { system: sheetPrompt(), user: content.block, maxTokens: 8192, temperature: 0.3, beforeRetry: () => enforceStudyLimit(session.userId) },
    sheetSchema,
    "fiche de révision",
  );
  const fix = (s: string) => fixLatexEscapes(s);
  const data: SheetData = {
    title: value.title,
    summary: fix(value.summary),
    keyConcepts: value.keyConcepts.map((c) => ({ term: fix(c.term), explanation: fix(c.explanation) })),
    definitions: value.definitions.map((c) => ({ term: fix(c.term), definition: fix(c.definition) })),
    formulas: value.formulas.map((f) => ({
      name: fix(f.name),
      latex: fixLatexEscapes(f.latex.replace(/^\$+|\$+$/g, ""), true),
      explanation: fix(f.explanation),
    })),
    pitfalls: value.pitfalls.map(fix),
    sources: pickSources(value.sources, content.sources, 30) satisfies Source[],
  };
  return { data, model };
}

export async function createSheet(session: Session & { ctx: CourseContext }, body: CreateSheetRequest): Promise<Sheet> {
  const scope = body.scope ?? {};
  const { data, model } = await generate(session, scope);
  if (body.title) data.title = body.title;
  const { data: row, error } = await session.supabase
    .from("study_sheets")
    .insert({
      user_id: session.userId,
      course_id: session.courseId,
      title: data.title.slice(0, 200),
      scope,
      data,
      content: sheetMarkdown(data),
      model,
    })
    .select(COLUMNS)
    .single();
  if (error || !row) dbError(error);
  return toSheet(row as SheetRow);
}

/** Régénère le contenu d'une fiche (même périmètre, même titre). */
export async function regenerateSheet(session: Session & { ctx: CourseContext }, sheetId: string): Promise<Sheet> {
  const existing = await getSheet(session, sheetId);
  // Périmètre relu en base (modifiable par l'utilisateur) : revalidé, tout le cours s'il est invalide
  const checked = parse(scopeSchema, existing.scope);
  const { data, model } = await generate(session, checked.ok ? checked.value : {});
  data.title = existing.title;
  const { data: row, error } = await session.supabase
    .from("study_sheets")
    .update({ data, content: sheetMarkdown(data), model, updated_at: new Date().toISOString() })
    .eq("id", sheetId)
    .select(COLUMNS)
    .single();
  if (error || !row) dbError(error);
  return toSheet(row as SheetRow);
}

export async function listSheets({ supabase, courseId }: Session): Promise<SheetSummary[]> {
  const { data, error } = await supabase
    .from("study_sheets")
    .select("id, title, scope, created_at, updated_at")
    .eq("course_id", courseId)
    .order("updated_at", { ascending: false })
    .limit(LIST_MAX);
  if (error) dbError(error);
  return (data ?? []).map(toSummary);
}

export async function getSheet({ supabase, courseId }: Session, sheetId: string): Promise<Sheet> {
  const { data, error } = await supabase.from("study_sheets").select(COLUMNS).eq("id", sheetId).eq("course_id", courseId).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new StudyError("Fiche introuvable", 404);
  return toSheet(data as SheetRow);
}

export async function deleteSheet({ supabase, courseId }: Session, sheetId: string) {
  const { data, error } = await supabase.from("study_sheets").delete().eq("id", sheetId).eq("course_id", courseId).select("id");
  if (error) dbError(error);
  if (!data?.length) throw new StudyError("Fiche introuvable", 404);
}

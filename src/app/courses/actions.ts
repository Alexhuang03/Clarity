"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { analyzeCourse as runAnalysis } from "@/lib/course/analyze";
import { enqueueDocument } from "@/lib/ingest/queue";
import { createClient } from "@/lib/supabase/server";

export async function createCourse(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const title = String(formData.get("title") ?? "").trim();
  const subjectName = String(formData.get("subject") ?? "").trim();
  if (!title) return { error: "Donne un titre à ton cours." };

  await getCurrentUser();
  const supabase = await createClient();
  const subjectId = await resolveSubject(supabase, subjectName);

  const { data: course, error } = await supabase
    .from("courses")
    .insert({ title, subject_id: subjectId })
    .select("id")
    .single();
  if (error || !course) return { error: "Impossible de créer le cours." };
  redirect(`/courses/${course.id}`);
}

export async function deleteCourse(courseId: string) {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: docs } = await supabase.from("documents").select("storage_path").eq("course_id", courseId);
  if (docs?.length) await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
  const { data: course } = await supabase.from("courses").select("subject_id").eq("id", courseId).maybeSingle();
  await supabase.from("courses").delete().eq("id", courseId).eq("user_id", user.id);
  await deleteSubjectIfUnused(supabase, course?.subject_id ?? null);
  revalidatePath("/");
  redirect("/");
}

const TITLE_MAX = 120;
const SUBJECT_MAX = 60;

export async function updateCourse(
  courseId: string,
  input: { title: string; subject: string },
): Promise<{ error: string | null }> {
  const title = input.title.trim().slice(0, TITLE_MAX);
  const subjectName = input.subject.trim().slice(0, SUBJECT_MAX);
  if (!title) return { error: "Le titre ne peut pas être vide." };

  await getCurrentUser();
  const supabase = await createClient();
  // RLS : ne renvoie le cours que s'il appartient à l'utilisateur
  const { data: course } = await supabase.from("courses").select("subject_id").eq("id", courseId).maybeSingle();
  if (!course) return { error: "Cours introuvable." };

  const subjectId = await resolveSubject(supabase, subjectName);
  const { error } = await supabase.from("courses").update({ title, subject_id: subjectId }).eq("id", courseId);
  if (error) return { error: "Impossible d'enregistrer les modifications." };

  if (course.subject_id !== subjectId) await deleteSubjectIfUnused(supabase, course.subject_id);
  revalidatePath("/");
  revalidatePath(`/courses/${courseId}`);
  return { error: null };
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Matière existante (sans tenir compte des majuscules) ou nouvelle matière ; null si vide. */
async function resolveSubject(supabase: ServerSupabase, name: string): Promise<string | null> {
  if (!name) return null;
  // ilike traite % et _ comme des jokers : on les échappe pour une comparaison exacte
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: existing } = await supabase.from("subjects").select("id").ilike("name", pattern).limit(1).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase.from("subjects").insert({ name }).select("id").single();
  return created?.id ?? null;
}

/** Supprime une matière qui n'est plus utilisée par aucun cours (évite d'encombrer les suggestions). */
async function deleteSubjectIfUnused(supabase: ServerSupabase, subjectId: string | null) {
  if (!subjectId) return;
  const { count } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", subjectId);
  if (count === 0) await supabase.from("subjects").delete().eq("id", subjectId);
}

const ALLOWED_EXTENSIONS = ["pdf", "md", "txt", "docx", "pptx", "png", "jpg", "jpeg", "webp"];

/** Enregistre un fichier déjà uploadé dans le stockage, puis lance son traitement en arrière-plan. */
export async function registerDocument(input: {
  courseId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  kind: "cours" | "exo";
}) {
  const user = await getCurrentUser();
  const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
  // Le chemin doit être dans le dossier de l'utilisateur et du cours (pas celui d'un autre)
  if (!input.storagePath.startsWith(`${user.id}/${input.courseId}/`) || !ALLOWED_EXTENSIONS.includes(ext)) {
    return { error: "Fichier refusé." };
  }
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      course_id: input.courseId,
      storage_path: input.storagePath,
      filename: input.filename,
      mime_type: input.mimeType || "application/octet-stream",
      kind: input.kind === "exo" ? "exo" : "cours",
    })
    .select()
    .single();
  if (error || !doc) return { error: "Impossible d'enregistrer le fichier." };

  // Le traitement (lecture par l'IA, embeddings) peut prendre plusieurs minutes : il passe par la
  // file d'attente (un document à la fois) et continue après la réponse au navigateur
  enqueueDocument(doc.id);
  return { document: doc };
}

export async function retryDocument(documentId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  // RLS : ne renvoie le document que s'il appartient à l'utilisateur
  const { data: doc } = await supabase.from("documents").select("id").eq("id", documentId).maybeSingle();
  if (!doc) return;
  await supabase.from("documents").update({ status: "uploaded", progress: 0, error: null }).eq("id", doc.id);
  enqueueDocument(doc.id);
}

export async function deleteDocument(documentId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, storage_path").eq("id", documentId).maybeSingle();
  if (!doc) return;
  await supabase.storage.from("documents").remove([doc.storage_path]);
  await supabase.from("documents").delete().eq("id", doc.id);
}

export async function changeDocumentKind(documentId: string, kind: "cours" | "exo") {
  await getCurrentUser();
  const supabase = await createClient();
  await supabase.from("documents").update({ kind }).eq("id", documentId);
}

export async function analyzeCourse(courseId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  try {
    const parts = await runAnalysis(supabase, courseId);
    return { parts };
  } catch (error) {
    console.error("[analyse] échec", error);
    return { error: "L'analyse a échoué. Réessaie." };
  }
}

/** URL temporaire pour ouvrir un document original (ex. depuis une source citée). */
export async function getDocumentUrl(documentId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", documentId).maybeSingle();
  if (!doc) return null;
  const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600);
  return data?.signedUrl ?? null;
}

export type CourseShare = { path: string; sharedAt: string } | null;

/** Lien de partage actuel du cours (null s'il n'est pas partagé). */
export async function getCourseShare(courseId: string): Promise<CourseShare> {
  await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase.from("course_shares").select("token, shared_at").eq("course_id", courseId).maybeSingle();
  return data ? { path: `/share/${data.token}`, sharedAt: data.shared_at } : null;
}

/** Crée le lien de partage, ou le met à jour pour inclure les derniers messages (le lien ne change pas). */
export async function shareCourse(courseId: string): Promise<{ share?: CourseShare; error?: string }> {
  await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_shares")
    .upsert({ course_id: courseId, shared_at: new Date().toISOString() }, { onConflict: "course_id" })
    .select("token, shared_at")
    .single();
  if (error || !data) return { error: "Impossible de créer le lien de partage." };
  return { share: { path: `/share/${data.token}`, sharedAt: data.shared_at } };
}

/** Supprime le lien : il ne fonctionne plus pour personne. */
export async function unshareCourse(courseId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  await supabase.from("course_shares").delete().eq("course_id", courseId);
}

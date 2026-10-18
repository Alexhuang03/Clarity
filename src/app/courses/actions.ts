"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { analyzeCourse as runAnalysis } from "@/lib/course/analyze";
import { processDocument } from "@/lib/ingest/pipeline";
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

  let subjectId: string | null = null;
  if (subjectName) {
    const { data: existing } = await supabase.from("subjects").select("id").ilike("name", subjectName).maybeSingle();
    subjectId = existing?.id ?? null;
    if (!subjectId) {
      const { data: created } = await supabase.from("subjects").insert({ name: subjectName }).select("id").single();
      subjectId = created?.id ?? null;
    }
  }

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
  await supabase.from("courses").delete().eq("id", courseId).eq("user_id", user.id);
  revalidatePath("/");
  redirect("/");
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

  // Le traitement (lecture par l'IA, embeddings) peut prendre plusieurs minutes
  after(() => processDocument(doc.id));
  return { document: doc };
}

export async function retryDocument(documentId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  // RLS : ne renvoie le document que s'il appartient à l'utilisateur
  const { data: doc } = await supabase.from("documents").select("id").eq("id", documentId).maybeSingle();
  if (!doc) return;
  await supabase.from("documents").update({ status: "uploaded", progress: 0, error: null }).eq("id", doc.id);
  after(() => processDocument(doc.id));
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

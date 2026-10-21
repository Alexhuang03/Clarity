"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Buckets dont les fichiers sont rangés dans un dossier par utilisateur (documents de cours, émotes importées)
const BUCKETS = ["documents", "emotes"];

// Liste récursivement tous les fichiers d'un dossier du stockage
async function listFiles(admin: ReturnType<typeof createAdminClient>, bucket: string, prefix: string) {
  const files: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    // Les dossiers n'ont pas d'id dans l'API de stockage
    if (entry.id) files.push(path);
    else files.push(...(await listFiles(admin, bucket, path)));
  }
  return files;
}

export async function deleteAccount(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  if (formData.get("confirmation") !== "SUPPRIMER") {
    return { error: "Tape SUPPRIMER pour confirmer." };
  }
  const user = await getCurrentUser();
  const admin = createAdminClient();

  try {
    // 1. Fichiers uploadés (le stockage n'est pas supprimé en cascade)
    for (const bucket of BUCKETS) {
      const files = await listFiles(admin, bucket, user.id);
      if (files.length > 0) {
        const { error } = await admin.storage.from(bucket).remove(files);
        if (error) throw error;
      }
    }
    // 2. Compte : toutes les tables référencent auth.users avec "on delete cascade"
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (e) {
    console.error("Suppression du compte échouée", e);
    return { error: "La suppression a échoué. Réessaie plus tard." };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signup");
}

"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "documents";

// Liste récursivement tous les fichiers d'un dossier du stockage
async function listFiles(admin: ReturnType<typeof createAdminClient>, prefix: string) {
  const files: string[] = [];
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    // Les dossiers n'ont pas d'id dans l'API de stockage
    if (entry.id) files.push(path);
    else files.push(...(await listFiles(admin, path)));
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
    const files = await listFiles(admin, user.id);
    if (files.length > 0) {
      const { error } = await admin.storage.from(BUCKET).remove(files);
      if (error) throw error;
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

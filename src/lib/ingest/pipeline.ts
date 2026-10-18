import "server-only";
import { embed } from "@/lib/ai/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkPages } from "./chunk";
import { extractDocument, UserFacingError } from "./extract";

/**
 * Traite un document uploadé : extraction du texte, découpage, embeddings.
 * Exécuté en arrière-plan (après la réponse au navigateur) avec le client admin :
 * l'appelant doit avoir vérifié que le document appartient à l'utilisateur.
 */
export async function processDocument(documentId: string) {
  const admin = createAdminClient();
  const setStatus = (fields: Record<string, unknown>) =>
    admin.from("documents").update(fields).eq("id", documentId);

  const { data: doc, error } = await admin.from("documents").select("*").eq("id", documentId).single();
  if (error || !doc) return console.error("[ingest] document introuvable", documentId, error);

  try {
    await setStatus({ status: "parsing", progress: 0, error: null });

    const { data: file, error: downloadError } = await admin.storage.from("documents").download(doc.storage_path);
    if (downloadError) throw downloadError;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { pages, pageCount } = await extractDocument(bytes, doc.mime_type, doc.filename, async (progress) => {
      await setStatus({ progress });
    });
    const chunks = chunkPages(pages);
    if (chunks.length === 0) throw new UserFacingError("Aucun texte trouvé dans ce fichier.");
    await setStatus({ progress: 85 });

    // Le titre de section aide la recherche sémantique ("Loi binomiale" + contenu)
    const vectors = await embed(
      chunks.map((c) => (c.section ? `${c.section}\n\n${c.content}` : c.content)),
      "RETRIEVAL_DOCUMENT",
    );

    // Traitement relancé : on remplace les anciens morceaux
    await admin.from("chunks").delete().eq("document_id", documentId);
    const rows = chunks.map((c, i) => ({
      user_id: doc.user_id,
      course_id: doc.course_id,
      document_id: documentId,
      ordinal: c.ordinal,
      page: c.page,
      section: c.section,
      content: c.content,
      embedding: JSON.stringify(vectors[i]),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error: insertError } = await admin.from("chunks").insert(rows.slice(i, i + 200));
      if (insertError) throw insertError;
    }

    await setStatus({
      status: "ready",
      progress: 100,
      page_count: pageCount,
      char_count: chunks.reduce((n, c) => n + c.content.length, 0),
    });
  } catch (e) {
    console.error("[ingest] échec", documentId, e);
    const message = e instanceof Error ? e.message : String(e);
    await setStatus({
      status: "error",
      error:
        e instanceof UserFacingError
          ? message
          : /quota|429|RESOURCE_EXHAUSTED/i.test(message)
            ? "Limite gratuite de l'IA atteinte. Réessaie dans quelques minutes."
            : "Impossible de lire ce fichier.",
    });
  }
}

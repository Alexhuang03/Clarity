"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DocumentRow } from "@/lib/course/types";
import { changeDocumentKind, deleteDocument, registerDocument, retryDocument } from "@/app/courses/actions";

const MAX_SIZE = 50 * 1024 * 1024;
// Type MIME envoyé au stockage (le navigateur n'en donne pas toujours un, ex. pour .md)
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const ACCEPT = Object.keys(MIME_BY_EXT).map((e) => `.${e}`).join(",");

const STATUS_LABEL: Record<DocumentRow["status"], string> = {
  uploaded: "En attente",
  parsing: "Lecture en cours",
  ready: "Prêt",
  error: "Erreur",
};

type Upload = { name: string; error?: string };

export function DocumentsPanel({
  courseId,
  userId,
  documents,
  onChange,
  defaultOpen,
}: {
  courseId: string;
  userId: string;
  documents: DocumentRow[];
  onChange: (updater: (docs: DocumentRow[]) => DocumentRow[]) => void;
  defaultOpen: boolean;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<"cours" | "exo">("cours");
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const processing = documents.filter((d) => d.status === "uploaded" || d.status === "parsing").length;

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const fail = (error: string) =>
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error } : x)));
      setUploads((u) => [...u, { name: file.name }]);

      if (!MIME_BY_EXT[ext]) {
        fail("Format non pris en charge");
        continue;
      }
      if (file.size > MAX_SIZE) {
        fail("Fichier trop lourd (50 Mo max)");
        continue;
      }
      // Nom de stockage neutre (les accents et espaces posent problème), le vrai nom est gardé en base
      const path = `${userId}/${courseId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: MIME_BY_EXT[ext] });
      if (uploadError) {
        fail("Échec de l'envoi");
        continue;
      }
      const result = await registerDocument({
        courseId,
        storagePath: path,
        filename: file.name,
        mimeType: MIME_BY_EXT[ext],
        kind,
      });
      if ("error" in result && result.error) {
        fail(result.error);
        continue;
      }
      setUploads((u) => u.filter((x) => x.name !== file.name));
      if ("document" in result && result.document) onChange((docs) => [...docs, result.document as DocumentRow]);
    }
  }

  async function remove(doc: DocumentRow) {
    if (!confirm(`Supprimer « ${doc.filename} » ?`)) return;
    onChange((docs) => docs.filter((d) => d.id !== doc.id));
    await deleteDocument(doc.id);
  }

  async function retry(doc: DocumentRow) {
    onChange((docs) => docs.map((d) => (d.id === doc.id ? { ...d, status: "uploaded", progress: 0, error: null } : d)));
    await retryDocument(doc.id);
  }

  async function toggleKind(doc: DocumentRow) {
    const next = doc.kind === "cours" ? "exo" : "cours";
    onChange((docs) => docs.map((d) => (d.id === doc.id ? { ...d, kind: next } : d)));
    await changeDocumentKind(doc.id, next);
  }

  return (
    <section className="rounded-2xl border border-black/10 dark:border-white/15">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="font-medium">
          📎 Documents <span className="opacity-60">({documents.length})</span>
          {processing > 0 && <span className="ml-2 text-sm text-indigo-600 dark:text-indigo-400">· {processing} en lecture…</span>}
        </span>
        <span className="text-sm opacity-60">{open ? "Masquer" : "Afficher"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-black/10 px-4 py-4 dark:border-white/15">
          {documents.length > 0 && (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
                  <span className="min-w-0 flex-1 truncate font-medium" title={doc.filename}>
                    {doc.filename}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleKind(doc)}
                    title="Changer le type"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      doc.kind === "exo"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                    }`}
                  >
                    {doc.kind === "exo" ? "Exercices" : "Cours"}
                  </button>
                  <span
                    className={`text-xs ${
                      doc.status === "ready"
                        ? "text-green-600 dark:text-green-400"
                        : doc.status === "error"
                          ? "text-red-600 dark:text-red-400"
                          : "opacity-70"
                    }`}
                  >
                    {STATUS_LABEL[doc.status]}
                    {doc.status === "parsing" && ` · ${doc.progress} %`}
                    {doc.status === "ready" && doc.page_count ? ` · ${doc.page_count} p.` : ""}
                  </span>
                  {doc.status === "error" && (
                    <button type="button" onClick={() => retry(doc)} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                      Réessayer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    aria-label={`Supprimer ${doc.filename}`}
                    className="text-xs opacity-50 hover:text-red-600 hover:opacity-100"
                  >
                    Supprimer
                  </button>
                  {doc.status === "parsing" && (
                    <div className="h-1 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.max(doc.progress, 3)}%` }} />
                    </div>
                  )}
                  {doc.error && <p className="w-full text-xs text-red-600 dark:text-red-400">{doc.error}</p>}
                </li>
              ))}
            </ul>
          )}

          {uploads.map((u) => (
            <p key={u.name} className={`text-sm ${u.error ? "text-red-600 dark:text-red-400" : "opacity-70"}`}>
              {u.error ? `✕ ${u.name} : ${u.error}` : `Envoi de ${u.name}…`}
            </p>
          ))}

          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Ajouter comme :</span>
            {(["cours", "exo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full border px-3 py-1 ${
                  kind === k ? "border-indigo-500 bg-indigo-500/10 font-medium" : "border-black/15 dark:border-white/20"
                }`}
              >
                {k === "cours" ? "Cours" : "Exercices"}
              </button>
            ))}
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              uploadFiles([...e.dataTransfer.files]);
            }}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${
              dragging ? "border-indigo-500 bg-indigo-500/5" : "border-black/15 hover:border-indigo-400 dark:border-white/20"
            }`}
          >
            <p className="font-medium">Glisse tes fichiers ici ou clique pour choisir</p>
            <p className="mt-1 opacity-60">PDF, Word, PowerPoint, Markdown, texte ou images · 50 Mo max</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                uploadFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

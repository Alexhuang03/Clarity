"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DocumentRow } from "@/lib/course/types";
import { addLink, changeDocumentKind, deleteDocument, getDocumentUrl, registerDocument, retryDocument } from "@/app/courses/actions";

export type DocKind = "cours" | "exo";
export type Upload = { id: string; name: string; error?: string; link?: boolean };
type SetDocuments = (updater: (docs: DocumentRow[]) => DocumentRow[]) => void;

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
export const ACCEPT = Object.keys(MIME_BY_EXT).map((e) => `.${e}`).join(",");

const KIND_LABEL: Record<DocKind, string> = { cours: "Cours", exo: "Exercices" };

/** Envoi de fichiers : stockage, enregistrement, puis lecture par l'IA en arrière-plan. */
export function useDocumentUpload({ courseId, userId, onChange }: { courseId: string; userId: string; onChange: SetDocuments }) {
  const [supabase] = useState(createClient);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const upload = useCallback(
    async (files: File[], kind: DocKind) => {
      for (const file of files) {
        const id = crypto.randomUUID();
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const fail = (error: string) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, error } : x)));
        setUploads((u) => [...u, { id, name: file.name }]);
        if (!MIME_BY_EXT[ext]) {
          fail("format non pris en charge");
          continue;
        }
        if (file.size > MAX_SIZE) {
          fail("trop lourd (50 Mo max)");
          continue;
        }
        // Nom de stockage neutre (les accents et espaces posent problème), le vrai nom est gardé en base
        const path = `${userId}/${courseId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { contentType: MIME_BY_EXT[ext] });
        if (uploadError) {
          fail("échec de l'envoi");
          continue;
        }
        const result = await registerDocument({ courseId, storagePath: path, filename: file.name, mimeType: MIME_BY_EXT[ext], kind });
        if ("error" in result && result.error) {
          fail(result.error);
          continue;
        }
        setUploads((u) => u.filter((x) => x.id !== id));
        if ("document" in result && result.document) onChange((docs) => [...docs, result.document as DocumentRow]);
      }
    },
    [courseId, userId, onChange, supabase],
  );

  /** Lien vers un cours en ligne : le serveur le récupère. Renvoie false en cas d'échec (message affiché). */
  const addFromLink = useCallback(
    async (url: string, kind: DocKind) => {
      const id = crypto.randomUUID();
      let name = url;
      try {
        const u = new URL(url);
        name = `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname : ""}`;
      } catch {
        /* lien invalide : le serveur répondra avec un message clair */
      }
      setUploads((list) => [...list, { id, name, link: true }]);
      const result = await addLink({ courseId, url, kind }).catch(() => ({ error: "Connexion perdue. Réessaie." }));
      if ("error" in result && result.error) {
        const error = result.error;
        setUploads((list) => list.map((x) => (x.id === id ? { ...x, error } : x)));
        return false;
      }
      setUploads((list) => list.filter((x) => x.id !== id));
      if ("document" in result && result.document) onChange((docs) => [...docs, result.document as DocumentRow]);
      return true;
    },
    [courseId, onChange],
  );

  const dismiss = useCallback((id: string) => setUploads((u) => u.filter((x) => x.id !== id)), []);
  return { uploads, upload, addFromLink, dismiss };
}

/** Ouvre le document original dans un nouvel onglet. */
async function openDocument(doc: DocumentRow) {
  // L'onglet est ouvert tout de suite, sinon le navigateur bloque la fenêtre après l'appel serveur
  const tab = window.open("about:blank", "_blank");
  const url = await getDocumentUrl(doc.id);
  if (!url || !tab) return tab?.close();
  tab.location.href = url;
}

function docIcon(doc: DocumentRow) {
  if (doc.source_url) return "🔗";
  if (doc.mime_type.startsWith("image/")) return "🖼️";
  if (doc.mime_type === "application/pdf") return "📕";
  if (doc.filename.toLowerCase().endsWith(".pptx")) return "📊";
  return "📄";
}

/** Documents du cours, dans le sommaire : état de lecture, type, ouvrir, réessayer, supprimer. */
export function DocumentList({
  documents,
  onChange,
  onSettled,
}: {
  documents: DocumentRow[];
  onChange: SetDocuments;
  /** Après une suppression ou un changement de type enregistré : les parties du cours se mettent à jour */
  onSettled?: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? documents : documents.slice(0, 6);

  async function remove(doc: DocumentRow) {
    if (!confirm(`Supprimer « ${doc.filename} » ?\nCe qui en a été tiré ne servira plus aux réponses.`)) return;
    onChange((docs) => docs.filter((d) => d.id !== doc.id));
    await deleteDocument(doc.id);
    onSettled?.();
  }
  async function retry(doc: DocumentRow) {
    onChange((docs) => docs.map((d) => (d.id === doc.id ? { ...d, status: "uploaded", progress: 0, error: null } : d)));
    await retryDocument(doc.id);
  }
  async function toggleKind(doc: DocumentRow) {
    const next = doc.kind === "cours" ? "exo" : "cours";
    onChange((docs) => docs.map((d) => (d.id === doc.id ? { ...d, kind: next } : d)));
    await changeDocumentKind(doc.id, next);
    onSettled?.();
  }

  if (documents.length === 0) {
    return <p className="text-xs opacity-50">Aucun document. Ajoute-en avec le bouton + de la barre en bas.</p>;
  }

  return (
    <ul className="space-y-1" aria-label="Documents du cours">
      {shown.map((doc) => {
        const reading = doc.status === "uploaded" || doc.status === "parsing";
        return (
          <li key={doc.id} className="group rounded-md px-1.5 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
            <div className="flex items-center gap-2">
              <span aria-hidden className="shrink-0 text-xs">
                {docIcon(doc)}
              </span>
              <button
                type="button"
                onClick={() => doc.status === "ready" && void openDocument(doc)}
                disabled={doc.status !== "ready"}
                title={doc.source_url ? `${doc.filename}\n${doc.source_url}` : doc.status === "ready" ? `Ouvrir ${doc.filename}` : doc.filename}
                className="min-w-0 flex-1 truncate text-left enabled:hover:text-indigo-600 enabled:hover:underline dark:enabled:hover:text-indigo-300"
              >
                {doc.filename}
              </button>
              <button
                type="button"
                onClick={() => void remove(doc)}
                aria-label={`Supprimer ${doc.filename}`}
                title="Supprimer"
                className="shrink-0 rounded px-1 text-xs opacity-0 transition hover:text-red-600 group-hover:opacity-60 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-50"
              >
                ✕
              </button>
            </div>
            <div className="ml-5 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem]">
              <button
                type="button"
                onClick={() => void toggleKind(doc)}
                title="Changer : cours ou exercices"
                className={`rounded-full px-1.5 font-medium ${
                  doc.kind === "exo" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                }`}
              >
                {KIND_LABEL[doc.kind]}
              </button>
              {doc.status === "ready" && <span className="opacity-50">{doc.page_count ? `${doc.page_count} p.` : "prêt"}</span>}
              {reading && <span className="text-indigo-600 dark:text-indigo-400">{doc.status === "uploaded" ? "en attente…" : `lecture ${doc.progress} %`}</span>}
              {doc.status === "error" && (
                <>
                  <span className="text-red-600 dark:text-red-400" title={doc.error ?? undefined}>
                    erreur
                  </span>
                  <button type="button" onClick={() => void retry(doc)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    Réessayer
                  </button>
                </>
              )}
            </div>
            {doc.status === "parsing" && (
              <div className="ml-5 mt-1 h-0.5 overflow-hidden rounded bg-black/10 dark:bg-white/10">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.max(doc.progress, 3)}%` }} />
              </div>
            )}
            {doc.status === "error" && doc.error && <p className="ml-5 mt-0.5 text-[0.6875rem] text-red-600 dark:text-red-400">{doc.error}</p>}
          </li>
        );
      })}
      {documents.length > 6 && (
        <li>
          <button type="button" onClick={() => setAll((a) => !a)} className="px-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            {all ? "Voir moins" : `Voir les ${documents.length} documents`}
          </button>
        </li>
      )}
    </ul>
  );
}

/**
 * Bouton + de la barre de chat : ajouter un cours, des exercices, ou une photo (téléphone).
 * Le menu s'ouvre au-dessus de la barre.
 */
export function AddDocumentsButton({
  onFiles,
  onLink,
}: {
  onFiles: (files: File[], kind: DocKind) => void;
  /** Ajout d'un cours en ligne (page web, PDF, Google Drive...) */
  onLink: (url: string, kind: DocKind) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState("");
  const [linkKind, setLinkKind] = useState<DocKind>("cours");
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const kind = useRef<DocKind>("cours");
  const root = useRef<HTMLDivElement>(null);

  // Un clic ailleurs ou Échap referme le menu
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setLinkMode(false);
  }
  async function submitLink() {
    const url = link.trim();
    if (!url) return;
    close();
    setLink("");
    // En cas d'échec, le message s'affiche au-dessus de la barre ; le lien est rendu pour le corriger
    if (!(await onLink(url, linkKind))) setLink(url);
  }

  const pick = (k: DocKind, from: "files" | "camera") => {
    kind.current = k;
    setOpen(false);
    (from === "camera" ? camera : input).current?.click();
  };
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length) onFiles(files, kind.current);
  };

  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10";
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Ajouter des documents"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Ajouter des documents"
        className={`flex h-10 w-10 items-center justify-center rounded-full text-xl leading-none transition hover:bg-black/5 dark:hover:bg-white/10 ${open ? "rotate-45 bg-black/5 dark:bg-white/10" : ""}`}
      >
        +
      </button>
      {open && linkMode && (
        // Pas de <form> : ce menu est déjà dans le formulaire de la barre de chat (formulaires imbriqués interdits)
        <div
          role="form"
          aria-label="Ajouter un lien"
          className="absolute bottom-full left-0 z-20 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-black/10 bg-[var(--background)] p-3 shadow-xl dark:border-white/15"
        >
          <p className="text-sm font-medium">🔗 Ajouter un lien</p>
          <p className="mt-0.5 text-xs opacity-60">
            Page web, PDF en ligne, Google Drive ou Docs (partagé « à tous ceux qui ont le lien »), Dropbox…
          </p>
          <input
            autoFocus
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitLink();
              }
            }}
            placeholder="https://…"
            aria-label="Adresse du cours"
            className="mt-2 w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-white/20"
          />
          <div className="mt-2 flex items-center gap-1.5">
            {(["cours", "exo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setLinkKind(k)}
                aria-pressed={linkKind === k}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  linkKind === k ? "border-indigo-500 bg-indigo-500/10 font-medium" : "border-black/15 dark:border-white/20"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={() => setLinkMode(false)} className="rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100">
              Retour
            </button>
            <button
              type="button"
              onClick={() => void submitLink()}
              disabled={!link.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}
      {open && !linkMode && (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-black/10 bg-[var(--background)] p-1.5 shadow-xl dark:border-white/15">
          <button type="button" role="menuitem" className={item} onClick={() => pick("cours", "files")}>
            <span aria-hidden>📘</span>
            <span>
              <span className="block font-medium">Ajouter un cours</span>
              <span className="block text-xs opacity-60">PDF, Word, PowerPoint, texte, images</span>
            </span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => pick("exo", "files")}>
            <span aria-hidden>📝</span>
            <span>
              <span className="block font-medium">Ajouter des exercices</span>
              <span className="block text-xs opacity-60">Sujets, TD, annales, corrigés</span>
            </span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => setLinkMode(true)}>
            <span aria-hidden>🔗</span>
            <span>
              <span className="block font-medium">Ajouter un lien</span>
              <span className="block text-xs opacity-60">Page web, PDF en ligne, Google Drive</span>
            </span>
          </button>
          {/* Sur téléphone : photographier directement une page */}
          <button type="button" role="menuitem" className={`${item} hidden [@media(pointer:coarse)]:flex`} onClick={() => pick("cours", "camera")}>
            <span aria-hidden>📷</span>
            <span className="font-medium">Prendre une photo</span>
          </button>
          <p className="px-3 pb-1 pt-1.5 text-[0.6875rem] opacity-50">Astuce : glisse tes fichiers sur la page, ou colle un lien dans la barre. 50 Mo max.</p>
        </div>
      )}
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={take} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={take} />
    </div>
  );
}

/** Fichiers en cours d'envoi ou de lecture, au-dessus de la barre de chat. */
export function UploadChips({
  uploads,
  documents,
  onDismiss,
}: {
  uploads: Upload[];
  documents: DocumentRow[];
  onDismiss: (id: string) => void;
}) {
  const reading = documents.filter((d) => d.status === "uploaded" || d.status === "parsing");
  if (!uploads.length && !reading.length) return null;
  const chip = "flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm bg-[var(--background)]";
  return (
    <ul className="mx-auto mb-2 flex max-w-[40rem] flex-wrap gap-1.5" aria-live="polite" aria-label="Documents en cours">
      {uploads.map((u) => (
        <li key={u.id} title={u.error} className={`${chip} ${u.error ? "max-w-full" : ""} ${u.error ? "border-red-500/40 text-red-700 dark:text-red-400" : "border-black/10 dark:border-white/15"}`}>
          {u.error ? <span aria-hidden>⚠</span> : <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />}
          <span className="truncate">{u.name}</span>
          <span className={u.error ? "min-w-0 opacity-80" : "shrink-0 opacity-70"}>{u.error ?? (u.link ? "récupération…" : "envoi…")}</span>
          {u.error && (
            <button type="button" onClick={() => onDismiss(u.id)} aria-label="Masquer" className="shrink-0 opacity-60 hover:opacity-100">
              ✕
            </button>
          )}
        </li>
      ))}
      {reading.map((d) => (
        <li key={d.id} className={`${chip} border-black/10 dark:border-white/15`} title="L'IA lit ce document">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          <span className="truncate">{d.filename}</span>
          <span className="shrink-0 tabular-nums opacity-60">{d.status === "uploaded" ? "en attente" : `${d.progress} %`}</span>
        </li>
      ))}
    </ul>
  );
}

/** Glisser des fichiers n'importe où sur la page : deux zones, cours ou exercices. */
export function DropOverlay({ onFiles }: { onFiles: (files: File[], kind: DocKind) => void }) {
  const [visible, setVisible] = useState(false);
  const [over, setOver] = useState<DocKind | null>(null);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setVisible(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setVisible(false);
    };
    const end = () => {
      depth.current = 0;
      setVisible(false);
      setOver(null);
    };
    // Empêche le navigateur d'ouvrir le fichier lâché à côté des zones
    const prevent = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      prevent(e);
      end();
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", end);
    };
  }, []);

  if (!visible) return null;
  const zone = (k: DocKind, icon: string, hint: string) => (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(k);
      }}
      onDragLeave={() => setOver((o) => (o === k ? null : o))}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files, k);
      }}
      className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
        over === k ? "scale-[1.02] border-indigo-500 bg-indigo-500/15" : "border-white/40 bg-white/5"
      }`}
    >
      <span className="text-4xl">{icon}</span>
      <span className="text-lg font-semibold">{KIND_LABEL[k]}</span>
      <span className="text-sm opacity-70">{hint}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[60] flex flex-col gap-4 bg-black/60 p-6 text-white backdrop-blur-sm sm:flex-row sm:p-12" data-drop-overlay>
      {zone("cours", "📘", "Lâche ici tes fichiers de cours")}
      {zone("exo", "📝", "Lâche ici tes sujets et exercices")}
    </div>
  );
}

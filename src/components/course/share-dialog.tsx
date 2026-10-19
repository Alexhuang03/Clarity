"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getCourseShare, shareCourse, unshareCourse, type CourseShare } from "@/app/courses/actions";

/**
 * Bouton « Partager » : ouvre une fenêtre qui crée un lien en lecture seule vers le cours.
 * Le lien montre le cours tel qu'il était au moment du partage (comme sur ChatGPT).
 */
export function ShareButton({
  courseId,
  title,
  className,
  children,
}: {
  courseId: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // undefined = pas encore chargé, null = pas de lien
  const [share, setShare] = useState<CourseShare | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // La fenêtre n'est créée qu'au premier clic, hors de la carte (dont l'opacité varie au survol)
  const [mounted, setMounted] = useState(false);

  const url = share ? `${window.location.origin}${share.path}` : "";

  function open() {
    setError(null);
    setCopied(false);
    setMounted(true);
    startTransition(async () => setShare(await getCourseShare(courseId)));
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await shareCourse(courseId);
      if (result.error) return setError(result.error);
      setShare(result.share);
      setCopied(false);
    });
  }

  function remove() {
    if (!confirm("Supprimer le lien ? Les personnes qui l'ont ne pourront plus voir ce cours.")) return;
    startTransition(async () => {
      await unshareCourse(courseId);
      setShare(null);
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={className}
        aria-label={`Partager le cours ${title}`}
        title="Partager"
      >
        {children}
      </button>
      {mounted &&
        createPortal(
          <dialog
            ref={(node) => {
              dialogRef.current = node;
              if (node && !node.open) node.showModal();
            }}
            onClose={() => setMounted(false)}
            // Clic sur le fond : ferme la fenêtre
            onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
            className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-black/10 bg-[var(--background)] p-0 text-[var(--foreground)] shadow-xl backdrop:bg-black/40 dark:border-white/15"
          >
            <div className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">Partager le cours</h2>
                  <p className="truncate text-sm opacity-60">{title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  aria-label="Fermer"
                  className="rounded-lg px-2 py-1 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm opacity-70">
                Toute personne qui a le lien peut lire les résumés et la conversation, sans pouvoir les modifier. Tes
                fichiers originaux restent privés. Les messages envoyés après le partage n&apos;apparaissent qu&apos;une
                fois le lien mis à jour.
              </p>

              {share === undefined ? (
                <div className="h-10 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
              ) : share ? (
                <>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label="Lien de partage"
                      className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/20"
                    />
                    <button
                      type="button"
                      onClick={copy}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                    >
                      {copied ? "Copié ✓" : "Copier"}
                    </button>
                  </div>
                  <p className="text-xs opacity-60">
                    Partagé le{" "}
                    {new Date(share.sharedAt).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={remove}
                      disabled={pending}
                      className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      Supprimer le lien
                    </button>
                    <button
                      type="button"
                      onClick={create}
                      disabled={pending}
                      className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
                    >
                      {pending ? "Mise à jour…" : "Mettre à jour le lien"}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={create}
                  disabled={pending}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {pending ? "Création du lien…" : "Créer un lien de partage"}
                </button>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

export function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.475l6.733-3.367A2.52 2.52 0 0 1 13 4.5Z" />
    </svg>
  );
}

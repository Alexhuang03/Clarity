"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getCourseShare, shareCourse, unshareCourse, type CourseShare } from "@/app/courses/actions";
import { useT } from "@/lib/i18n/client";

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
  const { t, intl } = useT();

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
    if (!confirm(t.share.removeConfirm)) return;
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
        aria-label={t.share.button(title)}
        title={t.share.buttonTitle}
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
            className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-[var(--radius-card)] border border-line bg-surface p-0 text-foreground shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm"
          >
            <div className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{t.share.title}</h2>
                  <p className="truncate text-sm text-muted">{title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  aria-label={t.common.close}
                  className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm text-muted">{t.share.explanation}</p>

              {share === undefined ? (
                <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
              ) : share ? (
                <>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={t.share.linkLabel}
                      className="field min-w-0 flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={copy}
                      className="btn btn-primary"
                    >
                      {copied ? t.share.copied : t.share.copy}
                    </button>
                  </div>
                  <p className="text-xs text-muted">
                    {t.share.sharedOn(
                      new Date(share.sharedAt).toLocaleString(intl, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    )}
                  </p>
                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={remove}
                      disabled={pending}
                      className="btn px-3 py-1.5 text-danger hover:bg-red-500/10"
                    >
                      {t.share.removeLink}
                    </button>
                    <button
                      type="button"
                      onClick={create}
                      disabled={pending}
                      className="btn btn-secondary px-3 py-1.5"
                    >
                      {pending ? t.share.updating : t.share.update}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={create}
                  disabled={pending}
                  className="btn btn-primary w-full py-2.5"
                >
                  {pending ? t.share.creatingLink : t.share.create}
                </button>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-danger">
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

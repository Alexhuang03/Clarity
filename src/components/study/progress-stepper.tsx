"use client";

/**
 * Progression dans un quiz : une barre par question (répondue, en cours, à venir), cliquable pour
 * y revenir. Inspiré de l'indicateur « bars » du Stepper de React Bits (https://reactbits.dev,
 * © David Haz, MIT + Commons Clause) — réécrit ici sans ses dépendances d'icônes et adapté aux
 * longues séries de questions (jusqu'à 30).
 */
export function ProgressStepper({
  count,
  current,
  answered,
  onSelect,
  status,
}: {
  count: number;
  current: number;
  answered: (index: number) => boolean;
  onSelect?: (index: number) => void;
  /** Après correction : couleur de chaque barre */
  status?: (index: number) => "correct" | "partial" | "incorrect" | "unanswered";
}) {
  const done = Array.from({ length: count }, (_, i) => answered(i)).filter(Boolean).length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums">
          Question {current + 1}
          <span className="text-muted"> / {count}</span>
        </span>
        <span className="text-xs tabular-nums text-muted">
          {done} répondue{done > 1 ? "s" : ""}
        </span>
      </div>
      <ol className="flex gap-1" aria-label="Questions">
        {Array.from({ length: count }, (_, i) => {
          const state = status?.(i);
          const fill = state
            ? state === "correct"
              ? "bg-success"
              : state === "partial"
                ? "bg-amber-500"
                : state === "incorrect"
                  ? "bg-danger"
                  : "bg-line-strong"
            : i === current
              ? "bg-accent"
              : answered(i)
                ? "bg-accent/45"
                : "bg-line-strong";
          return (
            <li key={i} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect?.(i)}
                disabled={!onSelect}
                aria-label={`Question ${i + 1}${answered(i) ? " (répondue)" : ""}`}
                aria-current={i === current ? "step" : undefined}
                className="group flex h-4 w-full items-center disabled:cursor-default"
              >
                <span
                  className={`h-1.5 w-full rounded-full transition-all duration-300 group-hover:h-2 ${fill} ${
                    i === current ? "h-2" : ""
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

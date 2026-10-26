import type { AnnotationRow } from "./types";

/**
 * Groupes d'annotations qui se chevauchent (au moins deux), dans l'ordre du texte.
 * Calculé à partir des ancres (positions dans le texte de la réponse), sans lire la page.
 * Les réactions n'en font pas partie : elles ont déjà leur autocollant.
 */
export function overlapClusters(annotations: AnnotationRow[]): AnnotationRow[][] {
  const items = annotations.filter((a) => a.kind !== "reaction");
  const parent = new Map(items.map((a) => [a.id, a.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.message_id === b.message_id && a.anchor.start < b.anchor.end && b.anchor.start < a.anchor.end) {
        parent.set(find(a.id), find(b.id));
      }
    }
  }
  const groups = new Map<string, AnnotationRow[]>();
  for (const a of items) groups.set(find(a.id), [...(groups.get(find(a.id)) ?? []), a]);
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => a.anchor.start - b.anchor.start || a.anchor.end - b.anchor.end));
}

/** Clé stable d'un groupe (pour React et pour retrouver sa pastille). */
export const clusterKey = (group: AnnotationRow[]) => group.map((a) => a.id).sort().join("|");

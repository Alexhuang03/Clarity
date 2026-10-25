// Verdict de l'IA dans une bulle : elle commence sa réponse par « VERDICT: CORRECT | PARTIEL | FAUX ».
// Partagé par le serveur (enregistrement) et le navigateur (affichage pendant le flux).

export type Verdict = "right" | "partial" | "wrong";

const CODES: Record<string, Verdict> = { correct: "right", partiel: "partial", faux: "wrong" };
const LINE = /^[ \t>*_#]*VERDICT\s*:?\s*\**\s*(CORRECT|PARTIEL|FAUX)\b[^\n]*(?:\n|$)/im;

/** Retire la ligne de verdict du texte et renvoie le verdict trouvé (le dernier, s'il y en a plusieurs). */
export function extractVerdict(text: string): { verdict: Verdict | null; content: string } {
  let verdict: Verdict | null = null;
  let content = text;
  let match: RegExpExecArray | null;
  while ((match = LINE.exec(content))) {
    verdict = CODES[match[1].toLowerCase()];
    content = content.slice(0, match.index) + content.slice(match.index + match[0].length);
  }
  return { verdict, content: content.replace(/^\s+/, "") };
}

/** Pendant le flux : le début du texte n'est-il encore qu'un morceau de « VERDICT: … » ? (à ne pas afficher) */
export function isPartialVerdict(text: string): boolean {
  const t = text.replace(/^[\s>*_#]+/, "").toUpperCase();
  if (!t || t.includes("\n")) return false;
  return "VERDICT".startsWith(t) || /^VERDICT\s*:?\s*\**\s*[A-Z]*$/.test(t);
}

/** Libellé et couleur du verdict selon ce qui a été vérifié. */
export function verdictBadge(kind: "error" | "understanding", verdict: Verdict) {
  const labels =
    kind === "error"
      ? { wrong: "Erreur confirmée", partial: "Imprécis", right: "Passage correct" }
      : { right: "Bien compris", partial: "Presque", wrong: "À revoir" };
  // Vert : le passage (ou la reformulation) est juste ; rouge : il est faux
  const tone = verdict === "right" ? "green" : verdict === "partial" ? "amber" : "red";
  return { label: labels[verdict], tone } as const;
}

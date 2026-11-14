// Niveau de détail des résumés : partagé entre le serveur et l'interface (aucun import serveur).

export const SUMMARY_DETAILS = ["concis", "detaille", "tres_detaille"] as const;
export type SummaryDetail = (typeof SUMMARY_DETAILS)[number];

export const isSummaryDetail = (value: unknown): value is SummaryDetail =>
  typeof value === "string" && (SUMMARY_DETAILS as readonly string[]).includes(value);

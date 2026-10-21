import type { Anchor } from "./anchor";

export type AnnotationKind = "highlight" | "question" | "understanding" | "error" | "reaction";

// Couleurs de surlignage (le style de chacune est dans globals.css : ::highlight(hl-...))
export const HIGHLIGHT_COLORS = ["yellow", "green", "pink", "blue"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  pink: "#f472b6",
  blue: "#60a5fa",
};

export type ThreadMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export type AnnotationRow = {
  id: string;
  message_id: string;
  kind: AnnotationKind;
  color: HighlightColor | null;
  anchor: Anchor;
  note: string | null;
  /** Émote collée sur le passage (réactions uniquement) */
  emote?: string | null;
  status: "open" | "understood" | "resolved";
  created_at: string;
  thread_messages?: ThreadMessage[];
};

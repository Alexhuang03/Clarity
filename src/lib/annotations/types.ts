import type { Anchor } from "./anchor";
import type { Source } from "@/lib/course/sources";
import type { Verdict } from "./verdict";

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

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Extraits cités par l'IA (réponses uniquement) */
  sources?: Source[];
  created_at: string;
};

/** Annotations qui ouvrent un fil de discussion avec l'IA (bulle dans la marge). */
export const THREAD_KINDS = ["question", "understanding", "error"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];
export const isThreadKind = (kind: AnnotationKind): kind is ThreadKind => (THREAD_KINDS as readonly string[]).includes(kind);

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
  /** Jugement de l'IA sur une erreur signalée ou sur « ce que j'ai compris » */
  verdict?: Verdict | null;
  created_at: string;
  thread_messages?: ThreadMessage[];
};

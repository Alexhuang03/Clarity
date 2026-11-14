import type { Source } from "./sources";

// Types partagés entre le serveur et l'interface
export type DocumentRow = {
  id: string;
  filename: string;
  kind: "cours" | "exo";
  mime_type: string;
  status: "uploaded" | "parsing" | "ready" | "error";
  progress: number;
  page_count: number | null;
  error: string | null;
  /** Document importé depuis un lien : adresse d'origine */
  source_url?: string | null;
  created_at: string;
};

export type PartRow = { id: string; ordinal: number; title: string };

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  kind: "chat" | "summary";
  part_id: string | null;
  content: string;
  sources: Source[];
  /** Réflexion du modèle pendant la rédaction (null si le modèle n'en fournit pas) */
  thinking?: string | null;
  thinking_ms?: number | null;
  created_at: string;
};

export type CourseRow = {
  id: string;
  title: string;
  analyzed_at: string | null;
  subject: { name: string; color: string } | null;
  /** upload : fichiers de l'utilisateur ; web : cours rédigé par le mode professeur */
  origin?: "upload" | "web";
};

"use server";

import { getCurrentUser } from "@/lib/auth";
import type { Anchor } from "@/lib/annotations/anchor";
import { HIGHLIGHT_COLORS, type AnnotationKind, type AnnotationRow, type HighlightColor } from "@/lib/annotations/types";
import { isEmote } from "@/lib/annotations/lol";
import { createClient } from "@/lib/supabase/server";

const KINDS: AnnotationKind[] = ["highlight", "question", "understanding", "error", "reaction"];
const NOTE_MAX = 4000;
const SELECT = "id, message_id, kind, color, anchor, note, emote, status, created_at, thread_messages(id, role, content, created_at)";

function validAnchor(a: Anchor): Anchor | null {
  if (!a || typeof a.quote !== "string" || !a.quote.trim() || a.quote.length > 5000) return null;
  if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 0 || a.end < a.start) return null;
  return {
    quote: a.quote,
    prefix: String(a.prefix ?? "").slice(-64),
    suffix: String(a.suffix ?? "").slice(0, 64),
    start: a.start,
    end: a.end,
  };
}

/**
 * Crée une annotation sur une réponse de l'IA.
 * - question : le texte devient le premier message du fil de discussion
 * - understanding / error : le texte est enregistré comme note
 */
export async function createAnnotation(input: {
  messageId: string;
  kind: AnnotationKind;
  color?: HighlightColor | null;
  emote?: string | null;
  anchor: Anchor;
  text?: string;
}): Promise<{ annotation?: AnnotationRow; error?: string }> {
  await getCurrentUser();
  const anchor = validAnchor(input.anchor);
  if (!anchor || !KINDS.includes(input.kind)) return { error: "Sélection invalide." };
  const color = input.kind === "highlight" && HIGHLIGHT_COLORS.includes(input.color!) ? input.color! : null;
  if (input.kind === "highlight" && !color) return { error: "Couleur invalide." };
  const emote = input.kind === "reaction" && isEmote(input.emote) ? input.emote : null;
  if (input.kind === "reaction" && !emote) return { error: "Émote inconnue." };
  const text = input.text?.trim().slice(0, NOTE_MAX) ?? "";
  // Une erreur peut être signalée sans explication ; une question ou une reformulation, non
  if ((input.kind === "question" || input.kind === "understanding") && !text) {
    return { error: "Écris quelque chose avant d'enregistrer." };
  }

  const supabase = await createClient();
  // RLS : on ne peut annoter qu'une réponse de l'IA de ses propres cours
  const { data: message } = await supabase
    .from("messages")
    .select("id, role")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!message || message.role !== "assistant") return { error: "Réponse introuvable." };

  const { data: created, error } = await supabase
    .from("annotations")
    .insert({
      message_id: message.id,
      kind: input.kind,
      color,
      emote,
      anchor,
      note: input.kind === "question" ? null : text || null,
    })
    .select("id")
    .single();
  if (error || !created) return { error: "Impossible d'enregistrer l'annotation." };

  if (input.kind === "question") {
    await supabase.from("thread_messages").insert({ annotation_id: created.id, role: "user", content: text });
  }
  const { data: annotation } = await supabase.from("annotations").select(SELECT).eq("id", created.id).single();
  return { annotation: annotation as AnnotationRow };
}

export async function updateHighlightColor(annotationId: string, color: HighlightColor) {
  await getCurrentUser();
  if (!HIGHLIGHT_COLORS.includes(color)) return;
  const supabase = await createClient();
  await supabase.from("annotations").update({ color }).eq("id", annotationId).eq("kind", "highlight");
}

export async function deleteAnnotation(annotationId: string) {
  await getCurrentUser();
  const supabase = await createClient();
  // Le fil de discussion est supprimé en cascade
  await supabase.from("annotations").delete().eq("id", annotationId);
}

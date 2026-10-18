import type { Page } from "./extract";

export type Chunk = { ordinal: number; page: number | null; section: string | null; content: string };

// Taille visée d'un morceau : assez court pour être une source précise,
// assez long pour garder le contexte d'une explication.
const TARGET = 1500;
const MAX = 2200;
// Un titre ne commence un nouveau morceau que si le morceau en cours est déjà consistant.
// Sinon (diapositives avec un petit titre tous les deux paragraphes) on obtient des fragments
// trop courts pour l'IA, et trop nombreux pour le quota d'embeddings (100 par minute en gratuit).
const MIN_BEFORE_HEADING = 700;

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;

function splitLong(paragraph: string): string[] {
  if (paragraph.length <= MAX) return [paragraph];
  const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > TARGET && current) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Découpe le texte en morceaux qui ne chevauchent jamais deux pages
 * (pour que chaque source pointe vers une page précise) et qui retiennent
 * le titre de la section en cours.
 */
export function chunkPages(pages: Page[]): Chunk[] {
  const chunks: Chunk[] = [];
  let section: string | null = null;

  for (const { page, text } of pages) {
    let buffer: string[] = [];
    let bufferSection = section;
    const flush = () => {
      const content = buffer.join("\n\n").trim();
      if (content) chunks.push({ ordinal: chunks.length, page, section: bufferSection, content });
      buffer = [];
      bufferSection = section;
    };

    // Les blocs $$...$$ et les tableaux restent entiers : on découpe sur les lignes vides
    for (const raw of text.split(/\n\s*\n/)) {
      const paragraph = raw.trim();
      if (!paragraph) continue;
      const heading = paragraph.split("\n")[0].match(HEADING);
      if (heading) {
        section = heading[2].replace(/[*_`]/g, "");
        // Le morceau prend le nom du premier titre qu'il contient
        if (buffer.join("\n\n").length >= MIN_BEFORE_HEADING) flush();
        if (buffer.length === 0) bufferSection = section;
      }
      for (const part of splitLong(paragraph)) {
        if (buffer.join("\n\n").length + part.length > TARGET && buffer.length) flush();
        buffer.push(part);
      }
    }
    flush();
  }
  return chunks;
}

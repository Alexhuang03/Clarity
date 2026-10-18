import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";
import TurndownService from "turndown";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { readFileWithGemini } from "@/lib/ai/gemini";

/** Erreur dont le message peut être montré tel quel à l'utilisateur. */
export class UserFacingError extends Error {}

export type Page = { page: number | null; text: string };
export type Extracted = { pages: Page[]; pageCount: number | null };

// Pages envoyées à Gemini par requête, et requêtes simultanées.
// 3 x 5 pages : progression régulière, et sous la limite gratuite (~10 requêtes / minute).
const PDF_BATCH = 5;
const PDF_CONCURRENCY = 3;

const TRANSCRIBE_RULES = `Règles :
- Ne traduis pas, ne résume pas, n'ajoute rien, n'omets rien.
- Titres en Markdown (#, ##, ###) selon la hiérarchie visible.
- Formules mathématiques en LaTeX : $...$ dans le texte, $$...$$ pour les formules isolées.
- Tableaux en tableaux Markdown.
- Pour chaque schéma, figure, graphique ou image utile : décris précisément ce qu'il montre (éléments, flèches, légendes, valeurs) entre [Schéma : ...].
- Ignore les en-têtes et pieds de page répétitifs ainsi que les numéros de page.
- Réponds uniquement avec la transcription.`;

function pdfPrompt(pageCount: number) {
  return `Transcris fidèlement en Markdown le contenu de ce PDF de ${pageCount} page(s).
Commence chaque page par une ligne exacte "=== PAGE n ===" (n de 1 à ${pageCount}, numéro de page dans CE fichier).
${TRANSCRIBE_RULES}`;
}

/** Découpe la transcription Gemini selon les marqueurs "=== PAGE n ===". */
function splitByPageMarkers(text: string, firstPage: number, pageCount: number): Page[] {
  const parts = text.split(/^=== PAGE (\d+) ===\s*$/m);
  if (parts.length < 3) return [{ page: firstPage, text: text.trim() }];
  const pages: Page[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const local = Math.min(Math.max(Number(parts[i]), 1), pageCount);
    const content = parts[i + 1]?.trim();
    if (content) pages.push({ page: firstPage + local - 1, text: content });
  }
  return pages;
}

async function extractPdf(data: Uint8Array, onProgress: (pct: number) => Promise<void>): Promise<Extracted> {
  const source = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = source.getPageCount();
  const batches: { start: number; count: number; bytes: Uint8Array }[] = [];
  for await (const batch of pdfBatches(source)) batches.push(batch);

  const results: Page[][] = new Array(batches.length);
  let pagesDone = 0;

  async function read({ start, count, bytes }: (typeof batches)[number]): Promise<Page[]> {
    const label = `pages ${start + 1}-${start + count}`;
    const t0 = Date.now();
    try {
      if (bytes.length > GEMINI_MAX_BYTES) throw new Error("page trop lourde pour Gemini");
      const text = await readFileWithGemini(bytes, "application/pdf", pdfPrompt(count));
      console.info(`[ingest] ${label} lues par Gemini en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      return splitByPageMarkers(text, start + 1, count);
    } catch (error) {
      // Quota Gemini épuisé, erreur, ou page seule trop lourde : extraction de texte brute
      // (sans formules ni schémas)
      console.warn(`[ingest] ${label} : Gemini indisponible, extraction de texte simple`, (error as Error).message);
      const { text } = await extractText(bytes, { mergePages: false });
      return text.flatMap((t, i) => (t.trim() ? [{ page: start + i + 1, text: t.trim() }] : []));
    }
  }

  // PDF_CONCURRENCY lots lus en même temps ; chaque "worker" prend le lot suivant dès qu'il a fini
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const index = next++;
      results[index] = await read(batches[index]);
      pagesDone += batches[index].count;
      await onProgress(Math.round((pagesDone / pageCount) * 80));
    }
  };
  await Promise.all(Array.from({ length: Math.min(PDF_CONCURRENCY, batches.length) }, worker));
  return { pages: results.flat(), pageCount };
}

// Gemini refuse les requêtes de plus de 20 Mo, et le fichier est encodé en base64 (+33 %)
export const GEMINI_MAX_BYTES = 14 * 1024 * 1024;

/**
 * Découpe le PDF en lots de PDF_BATCH pages. Un lot trop lourd (pages pleines d'images)
 * est redivisé en deux jusqu'à passer sous la limite de Gemini, ou jusqu'à une page seule.
 */
export async function* pdfBatches(source: PDFDocument, batchSize = PDF_BATCH) {
  const build = async (start: number, count: number) => {
    const doc = await PDFDocument.create();
    const indices = Array.from({ length: count }, (_, i) => start + i);
    (await doc.copyPages(source, indices)).forEach((p) => doc.addPage(p));
    return doc.save();
  };
  async function* split(start: number, count: number): AsyncGenerator<{ start: number; count: number; bytes: Uint8Array }> {
    const bytes = await build(start, count);
    if (bytes.length <= GEMINI_MAX_BYTES || count === 1) {
      yield { start, count, bytes };
      return;
    }
    const half = Math.ceil(count / 2);
    yield* split(start, half);
    yield* split(start + half, count - half);
  }
  const pageCount = source.getPageCount();
  for (let start = 0; start < pageCount; start += batchSize) {
    yield* split(start, Math.min(batchSize, pageCount - start));
  }
}

async function extractImage(data: Uint8Array, mimeType: string): Promise<Extracted> {
  if (data.length > GEMINI_MAX_BYTES) {
    throw new UserFacingError("Image trop lourde pour être lue par l'IA (14 Mo max). Réduis sa taille.");
  }
  const text = await readFileWithGemini(
    data,
    mimeType,
    `Transcris fidèlement en Markdown le contenu de cette image (texte, formules, schémas).\n${TRANSCRIBE_RULES}`,
  );
  return { pages: [{ page: 1, text: text.trim() }], pageCount: 1 };
}

async function extractDocx(data: Uint8Array): Promise<Extracted> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
  const markdown = new TurndownService({ headingStyle: "atx" }).turndown(html);
  return { pages: [{ page: null, text: markdown }], pageCount: null };
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENTITIES[e]);

async function extractPptx(data: Uint8Array): Promise<Extracted> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter((s) => s.n)
    .sort((a, b) => a.n - b.n);
  const pages: Page[] = [];
  for (const slide of slides) {
    const xml = await zip.file(slide.name)!.async("string");
    // Un paragraphe <a:p> contient des morceaux de texte <a:t>
    const paragraphs = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
      .map((p) => [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(""))
      .filter((p) => p.trim());
    if (paragraphs.length) {
      const [title, ...rest] = paragraphs;
      pages.push({ page: slide.n, text: `## ${title}\n\n${rest.join("\n\n")}` });
    }
  }
  return { pages, pageCount: slides.length };
}

export async function extractDocument(
  data: Uint8Array,
  mimeType: string,
  filename: string,
  onProgress: (pct: number) => Promise<void>,
): Promise<Extracted> {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (mimeType === "application/pdf" || ext === "pdf") return extractPdf(data, onProgress);
  if (mimeType.startsWith("image/")) return extractImage(data, mimeType);
  if (ext === "docx") return extractDocx(data);
  if (ext === "pptx") return extractPptx(data);
  if (ext === "md" || ext === "txt" || mimeType.startsWith("text/")) {
    return { pages: [{ page: null, text: new TextDecoder().decode(data) }], pageCount: null };
  }
  throw new UserFacingError(`Format non pris en charge : .${ext}`);
}

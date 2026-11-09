import "server-only";
import sharp from "sharp";
import { readFilesWithGemini } from "@/lib/ai/gemini";
import { fetchFigure } from "./link";

// Schémas d'un cours en Markdown (GitHub, page web...) : sans eux, l'IA ne voit que « ![Watermarking](...) »
// et doit deviner ce qu'ils expliquent. Chaque image est téléchargée puis décrite par Gemini ;
// la description prend la place de l'image dans le texte du cours, au même format que pour les PDF.

const MAX_FIGURES = 30;
/** Images par requête : peu d'images à la fois = descriptions plus détaillées (Flash-Lite, quota large) */
const PER_REQUEST = 3;
const REQUESTS_AT_ONCE = 3;
const DOWNLOADS_AT_ONCE = 4;
/** En dessous : icône ou logo, inutile pour comprendre le cours */
const MIN_SIDE = 80;
const MAX_SIDE = 1280;

const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

type Figure = { href: string; alt: string; section: string; image?: { data: Uint8Array; mimeType: string }; text?: string | null };

function prompt(figures: Figure[]) {
  return `Ces ${figures.length} images sont les schémas d'un cours, dans l'ordre. Pour chacune, décris précisément en français ce qu'elle montre, pour qu'un étudiant comprenne sans la voir :
- les éléments, les flèches et leur sens, les étapes dans l'ordre, les légendes et valeurs ;
- puis, en une phrase, l'idée que le schéma illustre ;
- cite les textes visibles dans leur langue d'origine (termes techniques, code), directement dans la description : pas de liste séparée ;
- ne parle pas des couleurs ou de la mise en page, sauf si elles portent un sens ;
- reste concis : 4 à 10 lignes, davantage seulement pour un schéma très chargé (chronologie, tableau de valeurs).
Si une image est décorative (logo, photo sans rapport avec le cours, bannière), écris seulement : DÉCORATIVE.
Ne te sers pas de tes connaissances pour ajouter ce qui n'est pas dans l'image.

Contexte de chaque image :
${figures.map((f, i) => `${i + 1}. section « ${f.section || "début du cours"} »${f.alt ? `, légende « ${f.alt} »` : ""}`).join("\n")}

Réponds exactement sous cette forme, une entrée par image, sans rien d'autre :
=== 1 ===
(description)
=== 2 ===
(description)`;
}

/** Image réduite (moins de jetons, lecture plus rapide), ou null si c'est une icône */
async function prepare(image: { data: Uint8Array; mimeType: string }) {
  const meta = await sharp(image.data, { failOn: "none" }).metadata();
  if (Math.max(meta.width ?? 0, meta.height ?? 0) < MIN_SIDE) return null;
  if (Math.max(meta.width ?? 0, meta.height ?? 0) <= MAX_SIDE) return image;
  const data = await sharp(image.data, { failOn: "none" })
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { data: new Uint8Array(data), mimeType: "image/png" };
}

async function inParallel<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

/**
 * Remplace les images d'un cours en Markdown par leur description.
 * Une image introuvable ou illisible devient « [Schéma : légende] » : le cours est toujours lu.
 */
export async function describeFigures(markdown: string, onProgress?: (done: number, total: number) => Promise<void>) {
  // Section de chaque image : le titre qui la précède
  const figures = new Map<string, Figure>();
  let section = "";
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) section = heading[1].trim();
    for (const m of line.matchAll(IMAGE)) {
      const href = m[2];
      if (/^https?:\/\//i.test(href) && !figures.has(href) && figures.size < MAX_FIGURES) {
        figures.set(href, { href, alt: m[1].trim(), section });
      }
    }
  }
  const list = [...figures.values()];

  if (list.length) {
    const t0 = Date.now();
    await inParallel(list, DOWNLOADS_AT_ONCE, async (f) => {
      const raw = await fetchFigure(f.href);
      const image = raw && (await prepare(raw).catch(() => undefined));
      if (image) f.image = image;
      // Icône (trop petite) : retirée ; image introuvable ou illisible : sa légende reste
      else f.text = image === null ? "DÉCORATIVE" : null;
    });
    const readable = list.filter((f) => f.image);
    // Lots de taille égale (13 images : 5 + 4 + 4 plutôt que 6 + 6 + 1)
    const size = Math.ceil(readable.length / Math.ceil(readable.length / PER_REQUEST));
    const batches = Array.from({ length: Math.ceil(readable.length / size) }, (_, i) => readable.slice(i * size, (i + 1) * size));
    let done = 0;
    await inParallel(batches, REQUESTS_AT_ONCE, async (batch) => {
      try {
        const answer = await readFilesWithGemini(
          batch.map((f) => f.image!),
          prompt(batch),
          { timeoutMs: 90_000, use: "figures" },
        );
        for (const [, n, text] of answer.matchAll(/===\s*(\d+)\s*===\s*\n([\s\S]*?)(?=\n===\s*\d+\s*===|$)/g)) {
          const f = batch[Number(n) - 1];
          if (f) f.text = text.trim();
        }
      } catch (error) {
        console.warn("[ingest] schémas non décrits", (error as Error).message.slice(0, 120));
      }
      done += batch.length;
      await onProgress?.(done, readable.length);
    });
    console.info(
      `[ingest] ${readable.length}/${list.length} schémas décrits en ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
  }

  const placed = new Set<string>();
  return markdown
    .replace(IMAGE, (_all, alt: string, href: string) => {
      const label = alt.trim();
      // Même image plusieurs fois (vignette + illustration) : décrite une seule fois
      if (placed.has(href)) return "";
      placed.add(href);
      const text = figures.get(href)?.text;
      if (text && /^D[ÉE]CORATIVE\.?$/i.test(text)) return "";
      if (text) return `\n\n[Schéma${label ? ` : ${label}` : ""}]\n${text}\n\n`;
      return label ? `[Schéma : ${label}]` : "";
    })
    .replace(/\n{3,}/g, "\n\n");
}

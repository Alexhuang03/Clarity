// Sources citables : chaque extrait envoyé à l'IA reçoit un numéro [S1], [S2]...
// Après la réponse, on ne garde que les numéros qui existent vraiment.

export type SourceChunk = {
  id: string;
  document_id: string;
  page: number | null;
  section: string | null;
  content: string;
};

export type DocumentInfo = { id: string; filename: string; kind: "cours" | "exo" };

/** Ce qui est stocké avec le message (colonne sources) et affiché dans l'interface. */
export type Source = {
  n: number;
  chunkId: string;
  documentId: string;
  filename: string;
  kind: "cours" | "exo";
  page: number | null;
  section: string | null;
  excerpt: string;
};

export function numberSources(chunks: SourceChunk[], documents: DocumentInfo[]): Source[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  return chunks.map((c, i) => {
    const doc = byId.get(c.document_id);
    return {
      n: i + 1,
      chunkId: c.id,
      documentId: c.document_id,
      filename: doc?.filename ?? "document",
      kind: doc?.kind ?? "cours",
      page: c.page,
      section: c.section,
      excerpt: c.content.slice(0, 280),
    };
  });
}

/** Bloc de texte envoyé à l'IA. */
export function formatSources(sources: Source[], chunks: SourceChunk[]): string {
  return sources
    .map((s, i) => {
      const where = [s.kind === "exo" ? "EXERCICE" : "COURS", s.filename, s.page ? `page ${s.page}` : null, s.section]
        .filter(Boolean)
        .join(" · ");
      return `[S${s.n}] (${where})\n${chunks[i].content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Les modèles n'écrivent pas tous les citations pareil : [**S6**], [S6, S7], [S6; S8], 【S6】...
 * On les ramène toutes à la forme [S6][S7].
 */
export function normalizeCitations(content: string): string {
  return content.replace(
    /[\[【]\s*\**\s*(S\d+(?:\s*[,;]\s*\**\s*S?\d+\s*\**)*)\s*\**\s*[\]】]/g,
    (_, list: string) =>
      list
        .split(/[,;]/)
        .map((n) => `[S${n.replace(/[^\d]/g, "")}]`)
        .join(""),
  );
}

/**
 * Retire les citations inventées (numéro inexistant) et renvoie les sources réellement citées.
 */
export function finalizeCitations(content: string, sources: Source[]) {
  const valid = new Map(sources.map((s) => [s.n, s]));
  const used = new Set<number>();
  const cleaned = normalizeCitations(content).replace(/\[S(\d+)\]/g, (match, n) => {
    const num = Number(n);
    if (!valid.has(num)) return "";
    used.add(num);
    return match;
  });
  return { content: cleaned, sources: sources.filter((s) => used.has(s.n)) };
}

/** Certains modèles écrivent les formules en \( ... \) et \[ ... \] : remark-math attend $ et $$. */
export function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, f: string) => `\n$$\n${f.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, f: string) => `$${f.trim()}$`);
}

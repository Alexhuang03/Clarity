// Ancrage des annotations dans le texte affiché d'une réponse de l'IA.
//
// Une annotation retient le passage exact, quelques caractères avant/après et sa position
// (sélecteur façon W3C Web Annotation). Si la position ne correspond plus (mise en page qui
// évolue), on retrouve le passage par son texte et son contexte.

export type Anchor = { quote: string; prefix: string; suffix: string; start: number; end: number };

const CONTEXT = 32;

// Parties ignorées : pastilles de sources, sommaire, liste des sources, titre « Voir le corrigé »,
// et la copie MathML invisible des formules (KaTeX affiche chaque formule en double).
const IGNORED = "[data-annot-ignore], .katex-mathml, summary";
// Une formule est un bloc : on ne peut pas en surligner seulement une partie
const ATOMIC = ".katex";

type Segment = { node: Text; start: number; end: number };
type TextIndex = { text: string; segments: Segment[] };

export function buildTextIndex(root: Element): TextIndex {
  const segments: Segment[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(IGNORED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    if (!value) continue;
    segments.push({ node, start: text.length, end: text.length + value.length });
    text += value;
  }
  return { text, segments };
}

/** Position dans le texte d'un point (nœud + décalage) du DOM, ou null s'il est hors du texte annotable. */
function offsetOf(index: TextIndex, root: Element, node: Node, offset: number, edge: "start" | "end"): number | null {
  // Point placé sur un élément : on le ramène au texte qui le suit (ou le précède)
  if (node.nodeType !== Node.TEXT_NODE) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const after = index.segments.find((s) => range.comparePoint(s.node, 0) >= 0);
    if (edge === "start") return after ? after.start : index.text.length;
    const before = [...index.segments].reverse().find((s) => range.comparePoint(s.node, s.node.length) <= 0);
    return before ? before.end : 0;
  }
  const segment = index.segments.find((s) => s.node === node);
  if (segment) return segment.start + Math.min(offset, segment.end - segment.start);
  // Texte ignoré (pastille de source...) : on prend le texte annotable le plus proche
  if (!root.contains(node)) return null;
  return offsetOf(index, root, node.parentElement!, 0, edge);
}

/** Élargit une plage pour englober entièrement les formules qu'elle touche. */
function snapToAtoms(index: TextIndex, start: number, end: number) {
  let s = start;
  let e = end;
  const atoms = new Map<Element, { start: number; end: number }>();
  for (const seg of index.segments) {
    const atom = seg.node.parentElement?.closest(ATOMIC);
    if (!atom) continue;
    const span = atoms.get(atom) ?? { start: seg.start, end: seg.end };
    span.start = Math.min(span.start, seg.start);
    span.end = Math.max(span.end, seg.end);
    atoms.set(atom, span);
  }
  for (const span of atoms.values()) {
    if (s > span.start && s < span.end) s = span.start;
    if (e > span.start && e < span.end) e = span.end;
  }
  return { start: s, end: e };
}

/** Transforme une sélection en ancre ; null si elle ne contient aucun texte annotable. */
export function anchorFromRange(root: Element, range: Range): Anchor | null {
  const index = buildTextIndex(root);
  const rawStart = offsetOf(index, root, range.startContainer, range.startOffset, "start");
  const rawEnd = offsetOf(index, root, range.endContainer, range.endOffset, "end");
  if (rawStart === null || rawEnd === null) return null;
  let { start, end } = snapToAtoms(index, Math.min(rawStart, rawEnd), Math.max(rawStart, rawEnd));
  // Une sélection qui coupe un mot l'englobe entièrement (on coupe souvent un mot sans le vouloir)
  const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}'’-]/u.test(c);
  while (start > 0 && isWordChar(index.text[start - 1]) && isWordChar(index.text[start])) start--;
  while (end < index.text.length && isWordChar(index.text[end - 1]) && isWordChar(index.text[end])) end++;
  // On retire les espaces en bord de sélection
  while (start < end && /\s/.test(index.text[start])) start++;
  while (end > start && /\s/.test(index.text[end - 1])) end--;
  if (end - start < 1) return null;
  return {
    quote: index.text.slice(start, end),
    prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: index.text.slice(end, end + CONTEXT),
    start,
    end,
  };
}

/** Longueur du suffixe commun de a et du préfixe commun de b (pour comparer les contextes). */
function commonEnd(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonStart(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Retrouve la position du passage dans le texte actuel. */
function locate(text: string, anchor: Anchor): number | null {
  if (text.slice(anchor.start, anchor.end) === anchor.quote) return anchor.start;
  // Le texte a bougé : parmi toutes les occurrences, celle dont le contexte ressemble le plus
  let best: { at: number; score: number } | null = null;
  for (let at = text.indexOf(anchor.quote); at !== -1; at = text.indexOf(anchor.quote, at + 1)) {
    const score =
      commonEnd(text.slice(Math.max(0, at - CONTEXT), at), anchor.prefix) +
      commonStart(text.slice(at + anchor.quote.length, at + anchor.quote.length + CONTEXT), anchor.suffix) -
      Math.abs(at - anchor.start) / 10_000;
    if (!best || score > best.score) best = { at, score };
  }
  return best ? best.at : null;
}

/** Plage du DOM correspondant à une ancre, ou null si le passage est introuvable. */
export function rangeFromAnchor(root: Element, anchor: Anchor, index = buildTextIndex(root)): Range | null {
  const at = locate(index.text, anchor);
  if (at === null) return null;
  const end = at + anchor.quote.length;
  const startSeg = index.segments.find((s) => at >= s.start && at < s.end);
  const endSeg = index.segments.find((s) => end > s.start && end <= s.end);
  if (!startSeg || !endSeg) return null;
  const range = document.createRange();
  range.setStart(startSeg.node, at - startSeg.start);
  range.setEnd(endSeg.node, end - endSeg.start);
  return range;
}

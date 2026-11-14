// Équations Word / PowerPoint (OMML, balises <m:oMath>) → LaTeX.
// Sans cette conversion, mammoth (Word) les supprime purement et simplement : « La probabilité vaut  pour un tirage. »
// Convertisseur volontairement simple (sans dépendance) : couvre fractions, puissances, indices, racines,
// sommes/intégrales, délimiteurs, fonctions, accents, matrices. Une structure inconnue garde au moins son texte.

import { mapElements } from "./xml-scan";

type XmlNode ={ name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()],
  );

/** Mini-analyseur XML (suffisant pour un fragment OMML bien formé). */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      top.text += decode(m[5]);
      continue;
    }
    const [, closing, name, rawAttrs, selfClosing] = m;
    const local = name.includes(":") ? name.split(":")[1] : name;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const key = a[1].includes(":") ? a[1].split(":")[1] : a[1];
      attrs[key] = decode(a[2] ?? a[3] ?? "");
    }
    const node: XmlNode = { name: local, attrs, children: [], text: "" };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

const child = (n: XmlNode | undefined, name: string) => n?.children.find((c) => c.name === name);
const prop = (n: XmlNode, pr: string, name: string) => child(child(n, pr), name)?.attrs.val;

const NARY: Record<string, string> = { "∑": "\\sum", "∏": "\\prod", "∐": "\\coprod", "∫": "\\int", "∬": "\\iint", "∭": "\\iiint", "∮": "\\oint", "⋃": "\\bigcup", "⋂": "\\bigcap" };
const ACCENTS: Record<string, string> = { "̂": "\\hat", "̃": "\\tilde", "̄": "\\bar", "⃗": "\\vec", "̇": "\\dot", "̈": "\\ddot", "ˇ": "\\check", "̌": "\\check", "́": "\\acute", "̀": "\\grave", "̆": "\\breve" };
const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "exp", "lim", "max", "min", "sup", "inf", "det", "deg", "arg", "dim", "gcd", "ker", "Pr"]);
const DELIMS: Record<string, string> = { "{": "\\{", "}": "\\}", "|": "|", "‖": "\\|", "⟨": "\\langle", "⟩": "\\rangle", "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil", "": "." };

/**
 * Caractère d'attribut (chr, begChr, endChr, sepChr) absent des tables : gardé seulement s'il s'agit d'UN symbole
 * sans rôle en LaTeX ni en Markdown, sinon remplacé par `fallback` (un « $ » fermerait la formule et injecterait du Markdown).
 */
const safeSymbol = (value: string, fallback: string) =>
  [...value].length === 1 && /^[\p{Sm}\p{So}\p{L}\p{N}+\-=<>!?.,:;'"/()[\]]$/u.test(value) ? value : fallback;

/** Délimiteur de \left / \right : connu, parenthèse ou crochet, sinon « . » (délimiteur invisible de LaTeX). */
const delimiter = (c: string) => DELIMS[c] ?? (/^[()[\]]$/.test(c) ? c : ".");

/** Texte d'une équation : caractères spéciaux de LaTeX échappés. */
const escapeText = (s: string) => s.replace(/[\\{}%#&$]/g, (c) => (c === "\\" ? "\\backslash " : `\\${c}`));

function convert(node: XmlNode): string {
  const all = () => node.children.map(convert).join("");
  const part = (name: string) => {
    const c = child(node, name);
    return c ? convert(c) : "";
  };
  switch (node.name) {
    case "#root":
    case "oMath":
    case "e":
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "deg":
    case "lim":
    case "fName":
    case "box":
    case "borderBox":
    case "phant":
      return all();
    case "oMathPara":
      return node.children.filter((c) => c.name === "oMath").map(convert).join(" \\\\ ");
    case "r":
      return node.children.filter((c) => c.name === "t").map((t) => escapeText(t.text)).join("");
    case "t":
      return escapeText(node.text);
    case "f":
      return prop(node, "fPr", "type") === "lin" ? `${part("num")}/${part("den")}` : `\\frac{${part("num")}}{${part("den")}}`;
    case "sSup":
      return `{${part("e")}}^{${part("sup")}}`;
    case "sSub":
      return `{${part("e")}}_{${part("sub")}}`;
    case "sSubSup":
      return `{${part("e")}}_{${part("sub")}}^{${part("sup")}}`;
    case "sPre":
      return `{}_{${part("sub")}}^{${part("sup")}}{${part("e")}}`;
    case "rad": {
      const deg = part("deg");
      return deg && prop(node, "radPr", "degHide") !== "1" ? `\\sqrt[${deg}]{${part("e")}}` : `\\sqrt{${part("e")}}`;
    }
    case "nary": {
      const chr = prop(node, "naryPr", "chr") ?? "∫";
      const sub = part("sub");
      const sup = part("sup");
      return `${NARY[chr] ?? safeSymbol(chr, "\\sum")}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""}{${part("e")}}`;
    }
    case "d": {
      const beg = prop(node, "dPr", "begChr") ?? "(";
      const end = prop(node, "dPr", "endChr") ?? ")";
      const sep = prop(node, "dPr", "sepChr") ?? "|";
      const inner = node.children.filter((c) => c.name === "e").map(convert).join(sep === "|" ? " \\mid " : ` ${safeSymbol(sep, "\\mid")} `);
      return `\\left${delimiter(beg)}${inner}\\right${delimiter(end)}`;
    }
    case "func": {
      const name = part("fName");
      const plain = name.replace(/[{}\\ ]/g, "");
      return `${FUNCTIONS.has(plain) ? `\\${plain}` : name} ${part("e")}`;
    }
    case "acc": {
      const chr = prop(node, "accPr", "chr") ?? "̂";
      return `${ACCENTS[chr] ?? "\\hat"}{${part("e")}}`;
    }
    case "bar":
      return prop(node, "barPr", "pos") === "bot" ? `\\underline{${part("e")}}` : `\\overline{${part("e")}}`;
    case "limLow": {
      const base = part("e");
      return /^\\?lim$/.test(base.trim()) ? `\\lim_{${part("lim")}}` : `\\underset{${part("lim")}}{${base}}`;
    }
    case "limUpp":
      return `\\overset{${part("lim")}}{${part("e")}}`;
    case "groupChr":
      return prop(node, "groupChrPr", "pos") === "top" ? `\\overbrace{${part("e")}}` : `\\underbrace{${part("e")}}`;
    case "m":
      return `\\begin{matrix}${node.children
        .filter((c) => c.name === "mr")
        .map((row) => row.children.filter((c) => c.name === "e").map(convert).join(" & "))
        .join(" \\\\ ")}\\end{matrix}`;
    case "eqArr":
      return `\\begin{aligned}${node.children.filter((c) => c.name === "e").map(convert).join(" \\\\ ")}\\end{aligned}`;
    default:
      // Propriétés (…Pr) ignorées ; structure inconnue : son contenu
      return node.name.endsWith("Pr") ? "" : all();
  }
}

/** Fragment OMML (<m:oMath> ou <m:oMathPara>) → LaTeX, sans délimiteurs. */
export function ommlToLatex(xml: string): string {
  // Équation illisible ou démesurée (aucune équation réelle ne pèse 200 Ko) : seulement son texte, échappé
  const textOnly = () => escapeText(decode(xml.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 2000));
  if (xml.length > MAX_EQUATION_XML) return textOnly();
  try {
    return convert(parseXml(xml)).replace(/\s+/g, " ").trim();
  } catch {
    return textOnly();
  }
}

/** Au-delà, une équation n'est pas analysée (garde-fou contre un fichier forgé) */
const MAX_EQUATION_XML = 200_000;

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Remplace les équations d'un XML Word ou PowerPoint par un texte $…$ ($$…$$ pour une équation isolée),
 * dans un « run » de texte du format concerné (lu ensuite comme du texte ordinaire).
 */
export function replaceEquations(xml: string, run: (text: string) => string): string {
  // Parcours linéaire (indexOf) : une balise jamais fermée ne fait pas relire tout le fichier à chaque équation
  const withParagraphs = mapElements(xml, "m:oMathPara", (m) => run(xmlEscape(` $$${ommlToLatex(m)}$$ `)));
  return mapElements(withParagraphs, "m:oMath", (m) => run(xmlEscape(`$${ommlToLatex(m)}$`)));
}

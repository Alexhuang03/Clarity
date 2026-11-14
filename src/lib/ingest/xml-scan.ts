// Parcours linéaire des éléments d'un XML Office (Word, PowerPoint) par indexOf.
// Remplace les expressions /<tag\b[\s\S]*?<\/tag>/g : sur une balise ouvrante jamais fermée, chaque correspondance
// relisait le fichier jusqu'au bout (temps quadratique, et document.xml peut peser 200 Mo une fois décompressé).
// Ici, chaque recherche repart après la précédente : temps linéaire, quoi que contienne le fichier.

/** Le caractère qui suit le nom de balise termine-t-il ce nom ? (« <a:p> » oui, « <a:pPr> » non) */
const endsName = (c: string | undefined) => c === ">" || c === "/" || c === " " || c === "\t" || c === "\n" || c === "\r";

/**
 * Appelle `visit` pour chaque élément <tag …>…</tag> (ou <tag …/>), dans l'ordre, sans imbrication du même nom.
 * Renvoie le texte reconstruit avec, à la place de chaque élément, ce que renvoie `visit` (texte inchangé si null).
 * Une balise ouvrante sans fermeture arrête le parcours (le reste est gardé tel quel).
 */
export function mapElements(xml: string, tag: string, visit: (element: string) => string | null): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let out = "";
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf(open, pos);
    if (start < 0) break;
    if (!endsName(xml[start + open.length])) {
      out += xml.slice(pos, start + open.length);
      pos = start + open.length;
      continue;
    }
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd < 0) break;
    let end: number;
    if (xml[tagEnd - 1] === "/") end = tagEnd + 1;
    else {
      const closing = xml.indexOf(close, tagEnd);
      if (closing < 0) break;
      end = closing + close.length;
    }
    const element = xml.slice(start, end);
    out += xml.slice(pos, start) + (visit(element) ?? element);
    pos = end;
  }
  return out + xml.slice(pos);
}

/** Liste des éléments <tag>…</tag>, dans l'ordre. */
export function elements(xml: string, tag: string): string[] {
  const found: string[] = [];
  mapElements(xml, tag, (element) => {
    found.push(element);
    return null;
  });
  return found;
}

/** Contenu (sans les balises) d'un élément <tag …>contenu</tag>. */
export function innerText(element: string): string {
  const start = element.indexOf(">");
  const end = element.lastIndexOf("</");
  return start < 0 || end <= start ? "" : element.slice(start + 1, end);
}

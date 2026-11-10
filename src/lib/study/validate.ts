// Mini-validateur de schémas (sans dépendance) pour les corps de requête et les réponses JSON des IA.
// Indulgent sur la forme (espaces retirés, textes trop longs coupés, listes trop longues raccourcies),
// strict sur le fond (type, valeurs minimales, choix permis).

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type Schema<T> = (input: unknown, path: string) => Result<T>;
export type Infer<S> = S extends Schema<infer T> ? T : never;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Objet validé : les champs dont la valeur peut être undefined deviennent facultatifs. */
export type ObjectOf<S extends Record<string, Schema<unknown>>> = Simplify<
  { [K in keyof S as undefined extends Infer<S[K]> ? never : K]: Infer<S[K]> } & {
    [K in keyof S as undefined extends Infer<S[K]> ? K : never]?: Infer<S[K]>;
  }
>;

const fail = (path: string, message: string): { ok: false; error: string } => ({
  ok: false,
  error: `${path || "valeur"} : ${message}`,
});

export function parse<T>(schema: Schema<T>, input: unknown): Result<T> {
  return schema(input, "");
}

export const v = {
  /** Texte (espaces retirés), coupé à `max` caractères, au moins `min` caractères. */
  string:
    (opts: { min?: number; max?: number } = {}): Schema<string> =>
    (input, path) => {
      if (typeof input !== "string" && typeof input !== "number") return fail(path, "texte attendu");
      let s = String(input).trim();
      if (s.length < (opts.min ?? 1)) return fail(path, "texte trop court");
      if (opts.max && s.length > opts.max) s = s.slice(0, opts.max);
      return { ok: true, value: s };
    },

  number:
    (opts: { min?: number; max?: number; int?: boolean } = {}): Schema<number> =>
    (input, path) => {
      const n = typeof input === "string" && input.trim() !== "" ? Number(input) : input;
      if (typeof n !== "number" || !Number.isFinite(n)) return fail(path, "nombre attendu");
      if (opts.int && !Number.isInteger(n)) return fail(path, "entier attendu");
      if (opts.min !== undefined && n < opts.min) return fail(path, `minimum ${opts.min}`);
      if (opts.max !== undefined && n > opts.max) return fail(path, `maximum ${opts.max}`);
      return { ok: true, value: n };
    },

  boolean: (): Schema<boolean> => (input, path) => {
    if (typeof input === "boolean") return { ok: true, value: input };
    if (input === "true" || input === "vrai") return { ok: true, value: true };
    if (input === "false" || input === "faux") return { ok: true, value: false };
    return fail(path, "booléen attendu");
  },

  literal:
    <const T extends string>(...values: T[]): Schema<T> =>
    (input, path) =>
      typeof input === "string" && (values as string[]).includes(input)
        ? { ok: true, value: input as T }
        : fail(path, `une valeur parmi ${values.join(", ")} attendue`),

  uuid: (): Schema<string> => (input, path) =>
    typeof input === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
      ? { ok: true, value: input.toLowerCase() }
      : fail(path, "identifiant invalide"),

  /** Liste : éléments invalides refusés (ou ignorés avec `dropInvalid`), coupée à `max`. */
  array:
    <T>(item: Schema<T>, opts: { min?: number; max?: number; dropInvalid?: boolean } = {}): Schema<T[]> =>
    (input, path) => {
      if (!Array.isArray(input)) return fail(path, "liste attendue");
      const out: T[] = [];
      for (const [i, el] of input.entries()) {
        const r = item(el, `${path}[${i}]`);
        if (r.ok) out.push(r.value);
        else if (!opts.dropInvalid) return r;
        if (opts.max && out.length >= opts.max) break;
      }
      if (out.length < (opts.min ?? 0)) return fail(path, `au moins ${opts.min} élément(s) valide(s) attendu(s)`);
      return { ok: true, value: out };
    },

  object:
    <S extends Record<string, Schema<unknown>>>(shape: S): Schema<ObjectOf<S>> =>
    (input, path) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) return fail(path, "objet attendu");
      const out: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        const r = schema((input as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
        if (!r.ok) return r;
        if (r.value !== undefined) out[key] = r.value;
      }
      return { ok: true, value: out as ObjectOf<S> };
    },

  /** Absent ou null → `fallback` (undefined par défaut). */
  optional:
    <T, D extends T | undefined = undefined>(schema: Schema<T>, fallback?: D): Schema<T | D> =>
    (input, path) =>
      input === undefined || input === null ? { ok: true, value: fallback as D } : schema(input, path),

  /** Valeur invalide → `fallback` au lieu d'une erreur (champs secondaires des réponses d'IA). */
  lenient:
    <T>(schema: Schema<T>, fallback: T): Schema<T> =>
    (input, path) => {
      const r = schema(input, path);
      return r.ok ? r : { ok: true, value: fallback };
    },

  /** Vérification supplémentaire après le schéma (null = valide, sinon message d'erreur). */
  refine:
    <T>(schema: Schema<T>, check: (value: T) => string | null): Schema<T> =>
    (input, path) => {
      const r = schema(input, path);
      if (!r.ok) return r;
      const message = check(r.value);
      return message ? fail(path, message) : r;
    },

  any: (): Schema<unknown> => (input) => ({ ok: true, value: input }),
};

/** Extrait l'objet JSON d'une réponse d'IA (blocs ```json, texte autour). */
export function extractJson(raw: string): unknown {
  const text = raw.replace(/^﻿/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // On cherche le premier objet complet
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // On continue avec les accolades
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("aucun objet JSON dans la réponse");
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Erreurs fréquentes des modèles : virgule finale avant } ou ], LaTeX non échappé (\alpha, \sum)
    // et caractères de contrôle bruts (retours à la ligne...) à l'intérieur des chaînes
    const repaired = escapeControlsInStrings(slice.replace(/\\(?!["\\/bfnrtu])/g, "\\\\")).replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired);
  }
}

const CONTROL_ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t", "\f": "\\f", "\b": "\\b" };

/** Échappe les caractères de contrôle présents tels quels dans les chaînes JSON (interdits par la norme). */
function escapeControlsInStrings(json: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === "\\") {
        out += ch + (json[i + 1] ?? "");
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      else if (ch < " ") {
        out += CONTROL_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/**
 * LaTeX mal échappé dans du JSON : "\frac" devient saut de page + "rac", "\theta" tabulation + "heta",
 * "\neq" retour à la ligne + "eq". Dans les passages mathématiques ($...$) et les champs LaTeX,
 * on remet la barre oblique.
 */
export function fixLatexEscapes(text: string, wholeIsLatex = false): string {
  const fix = (s: string) =>
    s
      .replace(/\f/g, "\\f")
      .replace(/\x08/g, "\\b")
      .replace(/\t(?=[a-zA-Z])/g, "\\t")
      .replace(/\r(?=[a-zA-Z])/g, "\\r")
      .replace(/\v/g, "\\v");
  if (wholeIsLatex) return fix(text).replace(/\n(?=[a-zA-Z])/g, "\\n");
  return text.replace(/\$\$[\s\S]+?\$\$|\$[^$]+\$/g, (m) => fix(m).replace(/\n(?=(?:eq|abla|u\b|ot|e\b|i\b|exists|mid|subseteq|leq|geq))/g, "\\n"));
}

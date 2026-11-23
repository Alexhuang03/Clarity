import "server-only";
import { modelChain } from "@/lib/ai/models";
import { generateWithFallback } from "@/lib/ai/providers";
import { LANGUAGE_NAME, type Locale } from "@/lib/course/language";
import { PROMPT_SECURITY_RULES, untrusted } from "@/lib/security/llm";
import { cleanText } from "@/lib/security/request";

// Recommandations de la barre du mode professeur : des sujets adaptés au cours (titre, matière) et au niveau.

export type SuggestionRequest = {
  courseId: string;
  title: string;
  subject: string | null;
  level: string | null;
  locale: Locale;
};

const COUNT = 4;
const ITEM_MIN = 6;
const ITEM_MAX = 90;
const CACHE_TTL_MS = 24 * 3600_000;
const CACHE_MAX = 2_000;

// Une même combinaison cours + niveau + langue ne repasse pas par l'IA : le quota gratuit reste aux cours
const globalForCache = globalThis as typeof globalThis & {
  __claritySuggestions?: Map<string, { at: number; items: string[] }>;
};
const cache = (globalForCache.__claritySuggestions ??= new Map());

const cacheKey = (r: SuggestionRequest) =>
  JSON.stringify([r.courseId, r.title, r.subject, r.level?.toLowerCase() ?? null, r.locale]);

export function cachedSuggestions(req: SuggestionRequest): string[] | null {
  const key = cacheKey(req);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.items;
}

function systemPrompt(locale: Locale) {
  return `Tu recommandes à un élève ${COUNT} sujets de cours qu'il pourrait demander à son professeur particulier.

RÈGLES
- Chaque sujet appartient clairement à la matière et au thème du cours indiqués. N'en sors jamais.
- Adapte la difficulté et le vocabulaire au niveau indiqué (programme correspondant). Sans niveau, propose des notions fondamentales de la matière.
- Les ${COUNT} sujets sont précis, variés et couvrent des aspects différents du thème.
- Formule chacun comme une demande courte, à l'infinitif ou en question, de 4 à 10 mots (au plus ${ITEM_MAX} caractères), par exemple « Comprendre les causes de la Révolution française ».
- Pas de numérotation, de lien, de markdown ni d'emoji.
- Si le titre et la matière ne désignent aucun sujet d'étude identifiable (« test », « aaa », « mon cours »), renvoie une liste vide : n'invente pas de thème.

RÉPONSE
Uniquement un objet JSON, sans texte autour : {"suggestions": ["...", "...", "...", "..."]}
Les sujets sont rédigés en ${LANGUAGE_NAME[locale]}.

${PROMPT_SECURITY_RULES}`;
}

function parseSuggestions(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse illisible");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { suggestions?: unknown };
  if (!Array.isArray(parsed.suggestions)) throw new Error("Réponse illisible");

  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of parsed.suggestions) {
    const text = cleanText(value, ITEM_MAX + 1).replace(/\s+/g, " ");
    // Le texte vient d'une IA nourrie de données de l'utilisateur : ni lien, ni balisage, ni texte hors format
    if (text.length < ITEM_MIN || text.length > ITEM_MAX || /https?:|www\.|[<>`[\]{}]/i.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length === COUNT) break;
  }
  return items;
}

export async function generateSuggestions(req: SuggestionRequest): Promise<string[]> {
  const raw = await generateWithFallback(modelChain("light"), {
    system: systemPrompt(req.locale),
    messages: [
      {
        role: "user",
        content: [
          untrusted("TITRE DU COURS", req.title, 200),
          req.subject ? untrusted("MATIÈRE", req.subject, 80) : "MATIÈRE : non précisée.",
          req.level ? untrusted("NIVEAU", req.level, 60) : "NIVEAU : non précisé.",
        ].join("\n\n"),
      },
    ],
    maxTokens: 400,
    temperature: 0.4,
    json: true,
    fast: true,
    signal: AbortSignal.timeout(20_000),
  });
  const items = parseSuggestions(raw);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey(req), { at: Date.now(), items });
  return items;
}

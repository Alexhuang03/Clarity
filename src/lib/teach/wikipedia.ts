import "server-only";
import type { Locale } from "@/lib/i18n/config";

// Secours du mode professeur quand la recherche Google n'est pas disponible : API publique de Wikipédia (sans clé).
// Aucune information sur l'utilisateur n'est transmise : seulement les mots-clés de recherche et un User-Agent générique.
// Le texte récupéré est une donnée NON FIABLE : il est toujours placé entre balises (untrusted) dans les consignes.

const USER_AGENT = "Clarity/1.0 (educational study app)";
// Hôte fixe par langue : jamais construit à partir d'une saisie
const HOSTS: Record<Locale, string> = { fr: "fr.wikipedia.org", en: "en.wikipedia.org", zh: "zh.wikipedia.org" };
const TIMEOUT_MS = 10_000;
// Réponse lue en flux et coupée au-delà (un article complet en texte brut fait rarement plus de 300 Ko)
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
// Requêtes à Wikipédia au plus par cours (recherches + articles, tous chapitres confondus)
const MAX_REQUESTS_PER_COURSE = 40;

// Par chapitre : jusqu'à 3 requêtes essayées, 2 articles gardés, 10 000 caractères chacun
const MAX_QUERIES = 3;
const MAX_PER_CHAPTER = 2;
const ARTICLE_CHARS = 10_000;

export type WikiArticle = { title: string; url: string; text: string };

// Sections de fin sans contenu de cours (références, liens...) : coupées
const TRAILING_SECTIONS =
  /^==+\s*(Notes|Notes et références|Références|Voir aussi|Liens externes|Bibliographie|Articles connexes|References|See also|External links|Further reading|Bibliography|Notes and references|参考文献|参考资料|参见|外部链接|注释|延伸阅读)\s*==+\s*$/im;

/** Contexte d'un cours : budget de requêtes restant et échéance globale de la génération. */
type CallContext = { left: number; signal?: AbortSignal };

/** Corps de la réponse lu en flux, abandonné dès qu'il dépasse `max` octets. */
async function readLimited(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new Error("Réponse Wikipédia trop volumineuse");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function call(locale: Locale, params: Record<string, string>, ctx: CallContext): Promise<unknown> {
  if (ctx.left <= 0) throw new Error("Budget de requêtes Wikipédia épuisé");
  ctx.left--;
  const url = new URL(`https://${HOSTS[locale]}/w/api.php`);
  for (const [k, v] of Object.entries({ ...params, format: "json", formatversion: "2" })) url.searchParams.set(k, v);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, Accept: "application/json" },
    signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
    redirect: "error",
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Wikipédia HTTP ${res.status}`);
  }
  return JSON.parse(await readLimited(res, MAX_RESPONSE_BYTES));
}

async function search(locale: Locale, query: string, ctx: CallContext): Promise<string[]> {
  const data = (await call(locale, {
    action: "query",
    list: "search",
    srsearch: query.slice(0, 100),
    srlimit: "3",
    srprop: "",
    srnamespace: "0",
  }, ctx)) as { query?: { search?: { title?: unknown }[] } };
  return (data.query?.search ?? []).map((r) => r.title).filter((t): t is string => typeof t === "string" && t.length < 300);
}

async function article(locale: Locale, title: string, ctx: CallContext): Promise<WikiArticle | null> {
  const data = (await call(locale, {
    action: "query",
    prop: "extracts|info",
    inprop: "url",
    explaintext: "1",
    exsectionformat: "wiki",
    redirects: "1",
    titles: title,
    ...(locale === "zh" ? { variant: "zh-cn" } : {}),
  }, ctx)) as { query?: { pages?: { title?: unknown; extract?: unknown; fullurl?: unknown; missing?: boolean }[] } };
  const page = data.query?.pages?.[0];
  if (!page || page.missing || typeof page.extract !== "string" || typeof page.title !== "string") return null;
  // Lien vers l'article : uniquement sur l'hôte Wikipédia attendu
  let url: string;
  try {
    const parsed = new URL(typeof page.fullurl === "string" ? page.fullurl : "");
    if (parsed.protocol !== "https:" || parsed.hostname !== HOSTS[locale]) throw new Error("hôte inattendu");
    url = parsed.toString();
  } catch {
    url = `https://${HOSTS[locale]}/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  }
  let text = page.extract;
  const cut = text.search(TRAILING_SECTIONS);
  if (cut > 0) text = text.slice(0, cut);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) return null;
  return { title: page.title, url, text: text.slice(0, ARTICLE_CHARS) };
}

/**
 * Recherche Wikipédia pour tout un cours : 1 ou 2 articles pertinents par chapitre, en privilégiant les articles
 * pas encore utilisés par les chapitres précédents (sources variées). Les articles sont mis en cache (un article
 * repris par deux chapitres = une seule source après déduplication). Ne lève jamais d'exception.
 */
export class WikipediaSession {
  private articles = new Map<string, Promise<WikiArticle | null>>();
  private searches = new Map<string, Promise<string[]>>();
  private used = new Set<string>();
  private ctx: CallContext;

  constructor(
    private locale: Locale,
    signal?: AbortSignal,
  ) {
    this.ctx = { left: MAX_REQUESTS_PER_COURSE, signal };
  }

  private search(query: string) {
    const key = query.toLowerCase();
    if (!this.searches.has(key)) this.searches.set(key, search(this.locale, query, this.ctx).catch(() => []));
    return this.searches.get(key)!;
  }

  private article(title: string) {
    if (!this.articles.has(title)) this.articles.set(title, article(this.locale, title, this.ctx).catch(() => null));
    return this.articles.get(title)!;
  }

  /** Articles d'un chapitre. `queries` : par ordre de préférence (requête du chapitre, titre, sujet du cours). */
  async forChapter(queries: string[], max = MAX_PER_CHAPTER): Promise<WikiArticle[]> {
    try {
      const fresh: WikiArticle[] = [];
      const reused: WikiArticle[] = [];
      const seen = new Set<string>();
      for (const q of queries.map((q) => q.trim()).filter(Boolean).slice(0, MAX_QUERIES)) {
        for (const title of await this.search(q)) {
          if (seen.has(title)) continue;
          seen.add(title);
          const a = await this.article(title);
          if (!a) continue;
          (this.used.has(a.url) ? reused : fresh).push(a);
          if (fresh.length >= max) break;
        }
        if (fresh.length >= max) break;
      }
      // Rien de neuf : un article déjà cité dans un chapitre précédent fait l'affaire
      const chosen = (fresh.length ? fresh : reused).slice(0, max);
      chosen.forEach((a) => this.used.add(a.url));
      return chosen;
    } catch (error) {
      console.warn("[professeur] Wikipédia indisponible", (error as Error).message);
      return [];
    }
  }
}

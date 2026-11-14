import "server-only";
import { embed } from "@/lib/ai/gemini";
import { modelChain } from "@/lib/ai/models";
import { streamWithFallback } from "@/lib/ai/providers";
import { normalizeMath } from "@/lib/course/sources";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { chunkPages } from "@/lib/ingest/chunk";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  convertModelCitations,
  finalizeWebCitations,
  insertGroundingCitations,
  SourceRegistry,
  stripLinks,
  stripModelCitations,
} from "./citations";
import { groundedGenerate, groundingAvailable, GroundingUnavailable } from "./grounding";
import {
  chapterPrompt,
  chapterUserMessage,
  MAX_CHAPTERS,
  planPrompt,
  planUserMessage,
  type CoursePlan,
  type SourceMode,
  type TeachRequest,
} from "./prompts";
import { WikipediaSession } from "./wikipedia";

/** Appels à l'IA au plus par cours (plan + un par chapitre) : sert aussi au décompte des limites. */
export const TEACH_MAX_LLM_CALLS = 1 + MAX_CHAPTERS;

const CHAPTER_MAX_TOKENS = 8192;
const COURSE_TITLE_MAX = 120;
const SUBJECT_MAX = 60;
// Échéance d'une génération complète (plan + chapitres + embeddings)
const DEADLINE_MS = 10 * 60_000;
// Morceaux au plus par cours (un chapitre en fait une dizaine)
const MAX_CHUNKS = 400;

class TeachError extends Error {}

// Textes du plan (titres, points, matière) : sans caractères de contrôle ni lien
const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? stripLinks(value.replace(/[\u0000-\u001f\u007f]/g, " ")).replace(/\s+/g, " ").trim().slice(0, max)
    : "";

/** Plan JSON renvoyé par l'IA (texte libre autour toléré), validé et borné. */
function parsePlan(raw: string): CoursePlan | null {
  try {
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const rawChapters = Array.isArray(json.chapters) ? json.chapters : Array.isArray(json.chapitres) ? json.chapitres : Array.isArray(json.modules) ? json.modules : [];
    const chapters = rawChapters
      .map((c: { title?: unknown; titre?: unknown; points?: unknown; notions?: unknown; query?: unknown; recherche?: unknown }) => ({
        title: clean(c?.title || c?.titre, 120),
        query: clean(c?.query || c?.recherche, 100),
        points: (Array.isArray(c?.points) ? c.points : Array.isArray(c?.notions) ? c.notions : []).map((p: unknown) => clean(p, 300)).filter(Boolean).slice(0, 8),
      }))
      .filter((c) => c.title)
      .slice(0, MAX_CHAPTERS);
    if (chapters.length === 0) return null;
    return {
      title: clean(json.title || json.titre || json.titre_cours, COURSE_TITLE_MAX),
      subject: clean(json.subject || json.matiere, SUBJECT_MAX) || null,
      chapters,
      queries: (Array.isArray(json.queries) ? json.queries : Array.isArray(json.recherches) ? json.recherches : []).map((q: unknown) => clean(q, 100)).filter(Boolean).slice(0, 3),
    };
  } catch {
    return null;
  }
}

/** Texte d'une réponse générée par la chaîne de modèles (sans recherche web), avec le modèle utilisé. */
async function generateText(
  chain: ReturnType<typeof modelChain>,
  system: string,
  user: string,
  { maxTokens, json = false, signal }: { maxTokens: number; json?: boolean; signal: AbortSignal },
) {
  let model = "";
  let text = "";
  for await (const chunk of streamWithFallback(
    chain,
    { system, messages: [{ role: "user", content: user }], maxTokens, temperature: 0.4, json, signal },
    (m) => (model = m),
  )) {
    if (chunk.type === "text") text += chunk.text;
  }
  return { text, model };
}

/** Sujet → matière de l'utilisateur (existante sans tenir compte des majuscules, sinon créée). */
async function resolveSubject(admin: ReturnType<typeof createAdminClient>, userId: string, name: string | null) {
  if (!name) return null;
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: existing } = await admin.from("subjects").select("id").eq("user_id", userId).ilike("name", pattern).limit(1).maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await admin.from("subjects").insert({ user_id: userId, name }).select("id").single();
  return (created?.id as string | undefined) ?? null;
}

/**
 * Génère le cours d'un sujet (mode professeur) et l'enregistre comme un cours ordinaire.
 * Exécuté en arrière-plan avec le client admin : la route a déjà vérifié l'utilisateur, la saisie et les limites,
 * et créé le cours, le document (statut « parsing ») et la ligne course_web.
 */
export async function generateTeachCourse(courseId: string) {
  const admin = createAdminClient();
  const started = Date.now();
  const { data: web } = await admin
    .from("course_web")
    .select("course_id, user_id, document_id, topic, level, goal, locale")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!web?.document_id) return console.error("[professeur] cours introuvable", courseId);
  const documentId = web.document_id as string;
  const userId = web.user_id as string;
  const setStatus = (fields: Record<string, unknown>) => admin.from("documents").update(fields).eq("id", documentId);

  const { data: doc } = await admin.from("documents").select("storage_path, user_id, course_id").eq("id", documentId).maybeSingle();
  if (!doc || doc.user_id !== userId || doc.course_id !== courseId) return console.error("[professeur] document incohérent", courseId);

  const req: TeachRequest = {
    topic: web.topic as string,
    level: (web.level as string | null) || null,
    goal: (web.goal as string | null) || null,
    locale: (isLocale(web.locale) ? web.locale : "fr") as Locale,
  };

  // Échéance globale : au-delà, la génération s'arrête (elle ne monopolise pas la file)
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const checkDeadline = () => {
    if (deadline.aborted) throw new TeachError("La génération a pris trop de temps. Réessaie.");
  };
  // Le cours a pu être supprimé pendant la génération : on s'arrête sans rien écrire
  const courseStillExists = async () =>
    !!(await admin.from("courses").select("id").eq("id", courseId).eq("user_id", userId).maybeSingle()).data;

  try {
    await setStatus({ status: "parsing", progress: 2, error: null });
    const registry = new SourceRegistry();
    let searchEntryPointHtml: string | null = null;
    let mode: SourceMode = "none";
    let plan: CoursePlan | null = null;
    let lastModel = "";

    // ---------- 1. Recherche + plan ----------
    if (groundingAvailable()) {
      try {
        const res = await groundedGenerate({
          system: planPrompt(req.locale, true),
          user: planUserMessage(req),
          maxTokens: 4096,
          temperature: 0.3,
          use: "teachPlan",
          signal: deadline,
        });
        plan = parsePlan(res.text);
        if (plan) {
          mode = "google";
          searchEntryPointHtml = res.searchEntryPointHtml;
          lastModel = res.model;
        }
      } catch (error) {
        if (!(error instanceof GroundingUnavailable)) throw error;
        console.warn("[professeur] recherche Google indisponible, secours Wikipédia :", error.message.slice(0, 200));
      }
    }
    if (!plan) {
      checkDeadline();
      const res = await generateText(modelChain("teachPlan"), planPrompt(req.locale, false), planUserMessage(req), {
        maxTokens: 4096,
        json: true,
        signal: deadline,
      });
      plan = parsePlan(res.text);
      lastModel = res.model;
      if (!plan) throw new TeachError("Le plan du cours n'a pas pu être établi. Réessaie.");
    }
    await setStatus({ progress: 10 });

    // Secours Wikipédia : 1 ou 2 articles par chapitre (requête du chapitre, puis son titre, puis le sujet du cours),
    // dédupliqués sur tout le cours par le registre. Abandonné après deux chapitres sans aucun résultat.
    const wikipedia = new WikipediaSession(req.locale, deadline);
    let wikiMisses = 0;
    const chapterArticles = async (i: number) => {
      if (wikiMisses >= 2) return [];
      const c = plan!.chapters[i];
      const found = await wikipedia.forChapter([c.query, c.title, plan!.queries[0] ?? req.topic]);
      wikiMisses = found.length ? 0 : wikiMisses + 1;
      return found;
    };

    // ---------- 2. Rédaction, chapitre par chapitre ----------
    const chapters: string[] = [];
    for (let i = 0; i < plan.chapters.length; i++) {
      checkDeadline();
      if (!(await courseStillExists())) return console.info("[professeur] cours supprimé pendant la génération", courseId);
      let text: string | null = null;
      if (mode === "google") {
        try {
          const res = await groundedGenerate({
            system: chapterPrompt(req.locale, "google"),
            user: chapterUserMessage(req, plan, i),
            maxTokens: CHAPTER_MAX_TOKENS,
            use: "teach",
            signal: deadline,
          });
          const ids = res.chunks.map((c) => registry.add(c.title, c.uri, "title"));
          text = insertGroundingCitations(stripModelCitations(normalizeMath(res.text)), res.supports, ids);
          searchEntryPointHtml ??= res.searchEntryPointHtml;
          lastModel = res.model;
        } catch (error) {
          if (!(error instanceof GroundingUnavailable)) throw error;
          // Plus de recherche Google pour les chapitres suivants : secours directement (pas de nouveaux essais)
          mode = "wikipedia";
          console.warn(`[professeur] chapitre ${i + 1} : recherche Google indisponible, secours pour la suite`);
        }
      }
      if (text === null) {
        const wiki = await chapterArticles(i);
        const articleIds = wiki.map((a) => registry.add(a.title, a.url, "url"));
        const chapterMode: SourceMode = wiki.length ? "wikipedia" : "none";
        checkDeadline();
        const res = await generateText(
          modelChain("teachWrite"),
          chapterPrompt(req.locale, chapterMode, wiki.length),
          chapterUserMessage(req, plan, i, wiki),
          { maxTokens: CHAPTER_MAX_TOKENS, signal: deadline },
        );
        const body = normalizeMath(res.text);
        text = chapterMode === "wikipedia" ? convertModelCitations(body, articleIds) : stripModelCitations(body);
        lastModel = res.model;
      }
      if (!text.trim()) throw new TeachError("La rédaction du cours a échoué. Réessaie.");
      // Aucun lien dans le texte rédigé (injection via un contenu web) : les seules adresses sont celles des sources
      chapters.push(stripLinks(text.replace(/^\s*#\s+.*\n/, "")).trim());
      await setStatus({ progress: 10 + Math.round((75 * (i + 1)) / plan.chapters.length) });
    }

    // ---------- 3. Citations : liste unifiée, numérotée dans l'ordre d'apparition ----------
    const { cited, plain, sources } = finalizeWebCitations(chapters, registry);
    const provider: SourceMode = sources.length === 0 ? "none" : sources.some((s) => !/wikipedia\.org$/.test(new URL(s.url).hostname)) ? "google" : "wikipedia";

    // ---------- 4. Morceaux + embeddings (comme un document importé) ----------
    const chunks = plan.chapters.flatMap((chapter, i) =>
      chunkPages([{ page: i + 1, text: `## ${chapter.title}\n\n${plain[i]}` }]).map((c) => ({
        ...c,
        chapter: i,
        // Le titre du chapitre aide la recherche sémantique ; les sections des morceaux (« Pièges fréquents »...) se répètent
        section: c.section && c.section !== chapter.title ? `${chapter.title} · ${c.section}`.slice(0, 300) : chapter.title,
      })),
    );
    if (chunks.length === 0) throw new TeachError("La rédaction du cours a échoué. Réessaie.");
    if (chunks.length > MAX_CHUNKS) chunks.length = MAX_CHUNKS;
    checkDeadline();
    if (!(await courseStillExists())) return console.info("[professeur] cours supprimé pendant la génération", courseId);
    await setStatus({ progress: 88 });
    const vectors = await embed(
      chunks.map((c) => `${c.section}\n\n${c.content}`),
      "RETRIEVAL_DOCUMENT",
    );

    // ---------- 5. Enregistrement ----------
    const title = plan.title || req.topic.slice(0, COURSE_TITLE_MAX);
    const markdown = [
      `# ${title}`,
      ...plan.chapters.map((c, i) => `## ${i + 1}. ${c.title}\n\n${cited[i].replace(/^(#{1,5}) /gm, "#$1 ")}`),
      sources.length ? `## Sources\n\n${sources.map((s) => `${s.n}. [${s.title.replace(/[[\]]/g, "")}](${s.url})`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    // Fichier « original » du cours (bouton d'ouverture du document) ; même dossier qu'un fichier importé
    const path = String(doc.storage_path);
    if (!path.startsWith(`${userId}/${courseId}/`) || path.includes("..")) throw new TeachError("Chemin refusé.");
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(path, new Blob([markdown], { type: "text/markdown" }), { contentType: "text/markdown", upsert: true });
    if (uploadError) throw uploadError;

    await admin.from("chunks").delete().eq("document_id", documentId);
    const rows = chunks.map((c, i) => ({
      user_id: userId,
      course_id: courseId,
      document_id: documentId,
      ordinal: i,
      page: null,
      section: c.section,
      content: c.content,
      embedding: JSON.stringify(vectors[i]),
    }));
    const chunkIds: string[] = [];
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await admin.from("chunks").insert(rows.slice(i, i + 200)).select("id, ordinal");
      if (error) throw error;
      chunkIds.push(...(data ?? []).sort((a, b) => a.ordinal - b.ordinal).map((r) => r.id as string));
    }

    // Une partie par chapitre, avec son texte comme résumé déjà rédigé (le cours s'affiche sans autre appel)
    await admin.from("course_parts").delete().eq("course_id", courseId);
    const { data: parts, error: partsError } = await admin
      .from("course_parts")
      .insert(
        plan.chapters.map((c, i) => ({
          user_id: userId,
          course_id: courseId,
          ordinal: i,
          title: c.title,
          chunk_ids: chunks.map((ch, k) => (ch.chapter === i ? chunkIds[k] : null)).filter(Boolean),
        })),
      )
      .select("id, ordinal");
    if (partsError) throw partsError;
    const partByOrdinal = new Map((parts ?? []).map((p) => [p.ordinal as number, p.id as string]));
    const base = Date.now();
    const { error: messagesError } = await admin.from("messages").insert(
      plan.chapters.map((_, i) => ({
        user_id: userId,
        course_id: courseId,
        part_id: partByOrdinal.get(i),
        role: "assistant",
        kind: "summary",
        content: cited[i],
        sources: [],
        model: lastModel || null,
        // Ordre d'affichage garanti : un insert groupé donnerait la même date à tous les messages
        created_at: new Date(base + i).toISOString(),
      })),
    );
    if (messagesError) throw messagesError;

    await admin.from("course_web_sources").delete().eq("course_id", courseId);
    if (sources.length) {
      const { error } = await admin.from("course_web_sources").insert(
        sources.map((s) => ({ course_id: courseId, user_id: userId, document_id: documentId, n: s.n, title: s.title, url: s.url, domain: s.domain })),
      );
      if (error) throw error;
    }
    await admin
      .from("course_web")
      .update({
        grounded: sources.length > 0,
        provider,
        search_entry_point_html: provider === "google" ? searchEntryPointHtml : null,
      })
      .eq("course_id", courseId);

    const subjectId = await resolveSubject(admin, userId, plan.subject).catch(() => null);
    await admin
      .from("courses")
      .update({ title, ...(subjectId ? { subject_id: subjectId } : {}), analyzed_at: new Date().toISOString() })
      .eq("id", courseId);
    await admin
      .from("documents")
      .update({ filename: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 190)}.md` })
      .eq("id", documentId);

    await setStatus({
      status: "ready",
      progress: 100,
      page_count: plan.chapters.length,
      char_count: chunks.reduce((n, c) => n + c.content.length, 0),
    });
    console.info(
      `[professeur] cours ${courseId} prêt : ${plan.chapters.length} chapitres, ${sources.length} sources (${provider}), ${chunks.length} morceaux, ${((Date.now() - started) / 1000).toFixed(0)} s`,
    );
  } catch (e) {
    console.error("[professeur] échec", courseId, e);
    const message = e instanceof Error ? e.message : String(e);
    await setStatus({
      status: "error",
      error:
        e instanceof TeachError
          ? message
          : /quota|429|RESOURCE_EXHAUSTED/i.test(message)
            ? "Limite gratuite de l'IA atteinte. Réessaie dans quelques minutes."
            : "La génération du cours a échoué. Réessaie.",
    });
  }
}

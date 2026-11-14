import { requestLocale } from "@/lib/course/language";
import {
  enforceGlobalRateLimits,
  enforceRateLimits,
  GLOBAL_RATE_LIMITS,
  RATE_LIMITS,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import {
  cleanText,
  isUuid,
  jsonError,
  readJsonBody,
  requireJsonContentType,
  requireSameOrigin,
  requireUser,
} from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEACH_MAX_LLM_CALLS } from "@/lib/teach/generate";
import { enqueueTeachCourse, teachQueueSize } from "@/lib/teach/queue";
import { TEACH_GOAL_MAX, TEACH_LEVEL_MAX, TEACH_TOPIC_MAX } from "@/lib/teach/types";

// Mode professeur : un sujet → un cours complet, sourcé sur le web, enregistré comme un cours ordinaire.
// Avec `courseId` : le cours est généré dans un cours existant et VIDE (créé avec « Nouveau cours »).
// Sans : un nouveau cours est créé (ancien comportement).
// La route répond tout de suite (202) ; la génération (plusieurs minutes) continue en arrière-plan dans une file
// d'attente, comme la lecture des fichiers importés. La page du cours suit le statut du document.
export const maxDuration = 60;

const TOPIC_MIN = 3;
// File pleine (tous utilisateurs) : nouvelles demandes refusées le temps qu'elle se vide
const QUEUE_MAX = 10;
// Une génération « en cours » plus ancienne est abandonnée (file de 10 x 10 min au plus) : elle ne bloque plus l'utilisateur
const IN_PROGRESS_MAX_AGE_MS = 2 * 3600_000;

const notEmpty = () =>
  Response.json(
    { error: "Ce cours contient déjà des documents.", code: "not_empty" },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  const refused = requireSameOrigin(request) ?? requireJsonContentType(request);
  if (refused) return refused;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;

  const body = await readJsonBody<{ topic: unknown; level: unknown; goal: unknown; courseId: unknown }>(request, 8 * 1024);
  if (body instanceof Response) return body;
  // Longueurs vérifiées avant nettoyage : une saisie trop longue est refusée, pas coupée en silence
  const tooLong = (v: unknown, max: number) => typeof v === "string" && v.trim().length > max;
  if (tooLong(body.topic, TEACH_TOPIC_MAX) || tooLong(body.level, TEACH_LEVEL_MAX) || tooLong(body.goal, TEACH_GOAL_MAX)) {
    return jsonError("Texte trop long.", 400);
  }
  if ((body.level != null && typeof body.level !== "string") || (body.goal != null && typeof body.goal !== "string")) {
    return jsonError("Requête invalide.", 400);
  }
  const topic = cleanText(body.topic, TEACH_TOPIC_MAX).replace(/\s+/g, " ");
  const level = cleanText(body.level, TEACH_LEVEL_MAX).replace(/\s+/g, " ") || null;
  const goal = cleanText(body.goal, TEACH_GOAL_MAX).replace(/\s+/g, " ") || null;
  if (topic.length < TOPIC_MIN) return jsonError("Sujet trop court.", 400);

  const admin = createAdminClient();
  // Erreurs de base (ex. migration absente) : détail dans les journaux du serveur, message court au navigateur
  const unavailable = (what: string, error: { message?: string; code?: string } | null | undefined) => {
    console.error(`[professeur] ${what} :`, error?.code ?? "", error?.message ?? "(sans message)");
    return jsonError("Service indisponible.", 503);
  };

  // ---------- Cours existant : appartient à l'utilisateur et n'a aucun document ----------
  // Son origine importe peu : un cours web dont la génération a échoué redevient vide quand l'utilisateur supprime
  // le document en erreur, et il peut alors relancer (un cours n'est jamais bloqué).
  let existing: { id: string; origin: string; analyzed_at: string | null } | null = null;
  if (body.courseId != null) {
    if (!isUuid(body.courseId)) return jsonError("Cours introuvable.", 404);
    // Client de l'utilisateur (RLS) : le cours d'un autre utilisateur n'est jamais renvoyé
    const { data: course, error } = await supabase
      .from("courses")
      .select("id, origin, analyzed_at")
      .eq("id", body.courseId)
      .maybeSingle();
    if (error) return unavailable("lecture du cours", error);
    if (!course) return jsonError("Cours introuvable.", 404);
    const { count, error: countError } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id);
    if (countError) return unavailable("comptage des documents", countError);
    if (count) return notEmpty();
    existing = {
      id: course.id as string,
      origin: course.origin === "web" ? "web" : "upload",
      analyzed_at: (course.analyzed_at as string | null) ?? null,
    };
  }

  // Une seule génération à la fois par utilisateur, et une file bornée pour tout le serveur
  const { data: running, error: runningError } = await admin
    .from("documents")
    .select("id, course_web!inner(course_id)")
    .eq("user_id", user.id)
    .in("status", ["uploaded", "parsing"])
    .gt("created_at", new Date(Date.now() - IN_PROGRESS_MAX_AGE_MS).toISOString())
    .limit(1);
  if (runningError) return unavailable("recherche des générations en cours", runningError);
  if (running?.length) return jsonError("Un cours est déjà en cours de génération.", 409);
  if (teachQueueSize() >= QUEUE_MAX) return jsonError("Trop de cours en préparation. Réessaie dans quelques minutes.", 503);

  // ---------- Réservation du cours existant, AVANT de compter les limites ----------
  // Mise à jour conditionnelle atomique : analyzed_at sert de jeton de version. La ligne n'est modifiée que si
  // l'origine et analyzed_at valent encore ce qui vient d'être lu ; de deux requêtes simultanées, une seule
  // l'obtient, l'autre reçoit 409. Le trigger d'origine autorise le passage à « web » à la clé secrète uniquement.
  let courseId = "";
  let createdDocId: string | null = null;
  let release: () => Promise<unknown>;
  if (existing) {
    const previous = existing;
    courseId = previous.id;
    let claim = admin
      .from("courses")
      .update({ origin: "web", analyzed_at: new Date().toISOString() })
      .eq("id", courseId)
      .eq("user_id", user.id)
      .eq("origin", previous.origin);
    claim = previous.analyzed_at ? claim.eq("analyzed_at", previous.analyzed_at) : claim.is("analyzed_at", null);
    const { data: claimed, error } = await claim.select("id");
    if (error) return unavailable("réservation du cours", error);
    if (!claimed?.length) return jsonError("Ce cours est déjà en cours de génération.", 409);
    const restore = () =>
      admin.from("courses").update({ origin: previous.origin, analyzed_at: previous.analyzed_at }).eq("id", courseId);
    // Échec plus loin : le cours redevient le cours vide qu'il était (il n'est jamais supprimé)
    release = async () => {
      await admin.from("course_web").delete().eq("course_id", courseId);
      if (createdDocId) await admin.from("documents").delete().eq("id", createdDocId);
      await restore();
    };
    // Un fichier a pu être ajouté entre la vérification et la réservation : nouvelle vérification, cours réservé
    const { count, error: recountError } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);
    if (recountError || count) {
      await restore();
      return recountError ? unavailable("comptage des documents", recountError) : notEmpty();
    }
    // Ancienne génération (échouée, document supprimé) : ses métadonnées et ses sources sont effacées avant de relancer
    const { error: oldWebError } = await admin.from("course_web").delete().eq("course_id", courseId);
    const { error: oldSourcesError } = await admin.from("course_web_sources").delete().eq("course_id", courseId);
    if (oldWebError || oldSourcesError) {
      await restore();
      return unavailable("nettoyage de l'ancienne génération", oldWebError ?? oldSourcesError);
    }
  } else {
    release = async () => {
      if (courseId) await admin.from("courses").delete().eq("id", courseId).eq("user_id", user.id);
    };
  }

  // ---------- Limites ----------
  // D'abord celles de l'utilisateur (3/heure, 3/jour, puis les 8 appels à l'IA suivants comptés d'un coup), ensuite
  // le plafond global (5 générations/jour pour tout le site). Dans cet ordre, un utilisateur déjà au maximum ne
  // consomme plus le plafond global : il ne peut pas l'épuiser seul.
  for (const check of [
    () => enforceRateLimits(user.id, RATE_LIMITS.teach),
    () => enforceRateLimits(user.id, RATE_LIMITS.teachCall, { cost: TEACH_MAX_LLM_CALLS - 1 }),
    () => enforceGlobalRateLimits(GLOBAL_RATE_LIMITS.teach),
  ]) {
    const result = await check();
    if (!result.ok) {
      await release();
      return rateLimitResponse(result);
    }
  }

  // Langue du cours : celle de l'interface (cookie), sinon le réglage enregistré
  const { data: settings } = await supabase.from("user_settings").select("*").maybeSingle();
  const locale = await requestLocale(settings?.locale);

  // ---------- Écritures (clé secrète : l'origine « web » et les métadonnées ne sont modifiables que par le serveur) ----------
  if (!existing) {
    const { data: course, error: courseError } = await admin
      .from("courses")
      .insert({ user_id: user.id, title: topic.slice(0, 120), origin: "web", analyzed_at: new Date().toISOString() })
      .select("id")
      .single();
    if (courseError || !course) {
      console.error("[professeur] création du cours impossible :", courseError?.code ?? "", courseError?.message);
      return jsonError("Impossible de créer le cours.", 500);
    }
    courseId = course.id as string;
  }

  const { data: doc, error: docError } = await admin
    .from("documents")
    .insert({
      user_id: user.id,
      course_id: courseId,
      kind: "cours",
      filename: `${topic.replace(/[\\/:*?"<>|]/g, "_").slice(0, 190)}.md`,
      mime_type: "text/markdown",
      storage_path: `${user.id}/${courseId}/${crypto.randomUUID()}.md`,
      status: "uploaded",
      progress: 0,
    })
    .select("id")
    .single();
  createdDocId = (doc?.id as string | undefined) ?? null;
  if (docError || !doc) {
    console.error("[professeur] création du document impossible :", docError?.code ?? "", docError?.message);
    await release();
    return jsonError("Impossible de créer le cours.", 500);
  }

  const { error: webError } = await admin
    .from("course_web")
    .insert({ course_id: courseId, user_id: user.id, document_id: doc.id, topic, level, goal, locale });
  if (webError) {
    console.error("[professeur] métadonnées impossibles :", webError.code ?? "", webError.message);
    await release();
    return jsonError("Impossible de créer le cours.", 500);
  }

  enqueueTeachCourse(courseId);
  return Response.json({ courseId }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

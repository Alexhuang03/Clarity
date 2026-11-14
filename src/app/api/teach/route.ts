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
// La route crée le cours et répond tout de suite (202) ; la génération (plusieurs minutes) continue en arrière-plan
// dans une file d'attente, comme la lecture des fichiers importés. La page du cours suit le statut du document.
export const maxDuration = 60;

const TOPIC_MIN = 3;
// File pleine (tous utilisateurs) : nouvelles demandes refusées le temps qu'elle se vide
const QUEUE_MAX = 10;
// Une génération « en cours » plus ancienne est abandonnée (file de 10 x 10 min au plus) : elle ne bloque plus l'utilisateur
const IN_PROGRESS_MAX_AGE_MS = 2 * 3600_000;

export async function POST(request: Request) {
  const refused = requireSameOrigin(request) ?? requireJsonContentType(request);
  if (refused) return refused;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;

  const body = await readJsonBody<{ topic: unknown; level: unknown; goal: unknown }>(request, 8 * 1024);
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

  // Une seule génération à la fois par utilisateur, et une file bornée pour tout le serveur
  const { data: running, error: runningError } = await admin
    .from("documents")
    .select("id, course_web!inner(course_id)")
    .eq("user_id", user.id)
    .in("status", ["uploaded", "parsing"])
    .gt("created_at", new Date(Date.now() - IN_PROGRESS_MAX_AGE_MS).toISOString())
    .limit(1);
  if (runningError) return jsonError("Service indisponible.", 503);
  if (running?.length) return jsonError("Un cours est déjà en cours de génération.", 409);
  if (teachQueueSize() >= QUEUE_MAX) return jsonError("Trop de cours en préparation. Réessaie dans quelques minutes.", 503);

  // Limites : d'abord celles de l'utilisateur (3/heure, 3/jour, puis les 8 appels à l'IA suivants comptés d'un coup),
  // ensuite le plafond global (5 générations/jour pour tout le site). Dans cet ordre, un utilisateur déjà au maximum
  // ne consomme plus le plafond global : il ne peut pas l'épuiser seul.
  const limited = await enforceRateLimits(user.id, RATE_LIMITS.teach);
  if (!limited.ok) return rateLimitResponse(limited);
  const calls = await enforceRateLimits(user.id, RATE_LIMITS.teachCall, { cost: TEACH_MAX_LLM_CALLS - 1 });
  if (!calls.ok) return rateLimitResponse(calls);
  const global = await enforceGlobalRateLimits(GLOBAL_RATE_LIMITS.teach);
  if (!global.ok) return rateLimitResponse(global);

  // Langue du cours : celle de l'interface (cookie), sinon le réglage enregistré
  const { data: settings } = await supabase.from("user_settings").select("*").maybeSingle();
  const locale = await requestLocale(settings?.locale);

  // Écriture avec la clé secrète : l'origine « web » et les métadonnées ne sont modifiables que par le serveur.
  // Le propriétaire est l'utilisateur vérifié ci-dessus.
  const { data: course, error: courseError } = await admin
    .from("courses")
    .insert({ user_id: user.id, title: topic.slice(0, 120), origin: "web", analyzed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (courseError || !course) {
    console.error("[professeur] création du cours impossible", courseError?.message);
    return jsonError("Impossible de créer le cours.", 500);
  }
  const cleanup = () => admin.from("courses").delete().eq("id", course.id).eq("user_id", user.id);

  const { data: doc, error: docError } = await admin
    .from("documents")
    .insert({
      user_id: user.id,
      course_id: course.id,
      kind: "cours",
      filename: `${topic.replace(/[\\/:*?"<>|]/g, "_").slice(0, 190)}.md`,
      mime_type: "text/markdown",
      storage_path: `${user.id}/${course.id}/${crypto.randomUUID()}.md`,
      status: "uploaded",
      progress: 0,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    console.error("[professeur] création du document impossible", docError?.message);
    await cleanup();
    return jsonError("Impossible de créer le cours.", 500);
  }

  const { error: webError } = await admin
    .from("course_web")
    .insert({ course_id: course.id, user_id: user.id, document_id: doc.id, topic, level, goal, locale });
  if (webError) {
    console.error("[professeur] métadonnées impossibles", webError.message);
    await cleanup();
    return jsonError("Impossible de créer le cours.", 500);
  }

  enqueueTeachCourse(course.id);
  return Response.json({ courseId: course.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

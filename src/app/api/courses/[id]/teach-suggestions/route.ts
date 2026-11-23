import { requestLocale } from "@/lib/course/language";
import { enforceRateLimits, RATE_LIMITS, rateLimitResponse } from "@/lib/security/rate-limit";
import {
  cleanText,
  isUuid,
  jsonError,
  readJsonBody,
  requireJsonContentType,
  requireSameOrigin,
  requireUser,
} from "@/lib/security/request";
import { cachedSuggestions, generateSuggestions } from "@/lib/teach/suggestions";
import { TEACH_LEVEL_MAX } from "@/lib/teach/types";

export const maxDuration = 30;

const reply = (suggestions: string[]) =>
  Response.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });

// Recommandations de sujets pour un cours vide, selon son titre, sa matière et le niveau choisi
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = requireSameOrigin(request) ?? requireJsonContentType(request);
  if (refused) return refused;
  const { id: courseId } = await params;
  if (!isUuid(courseId)) return jsonError("Cours introuvable", 404);
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;

  const body = await readJsonBody<{ level: unknown }>(request, 1024);
  if (body instanceof Response) return body;
  if (body.level != null && typeof body.level !== "string") return jsonError("Requête invalide.", 400);
  const level = cleanText(body.level, TEACH_LEVEL_MAX).replace(/\s+/g, " ") || null;

  // RLS : le cours d'un autre utilisateur n'est jamais renvoyé
  const { data: course } = await supabase
    .from("courses")
    .select("title, subject:subjects(name)")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return jsonError("Cours introuvable", 404);
  const subject = (course.subject as unknown as { name: string } | null)?.name ?? null;

  const { data: settings } = await supabase.from("user_settings").select("locale").maybeSingle();
  const locale = await requestLocale(settings?.locale);
  const req = { courseId, title: course.title as string, subject, level, locale };

  const cached = cachedSuggestions(req);
  if (cached) return reply(cached);

  const limited = await enforceRateLimits(user.id, RATE_LIMITS.teachSuggestions);
  if (!limited.ok) return rateLimitResponse(limited);

  try {
    return reply(await generateSuggestions(req));
  } catch (e) {
    console.error("[professeur] recommandations impossibles", e instanceof Error ? e.message : e);
    return jsonError("Recommandations indisponibles.", 503);
  }
}

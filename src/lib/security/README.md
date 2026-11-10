# src/lib/security — aides de sécurité

À utiliser dans toute nouvelle route d'API (`src/app/api/**/route.ts`) ou Server Action (`*actions.ts`),
en particulier celles qui appellent une IA.

## Modèle de route sûre

```ts
import { enforceRateLimits, RATE_LIMITS, rateLimitResponse } from "@/lib/security/rate-limit";
import { cleanText, isUuid, jsonError, readJsonBody, requireOwnedCourse, requireUser } from "@/lib/security/request";
import { untrusted } from "@/lib/security/llm";

export async function POST(request: Request, ctx: RouteContext<"/api/courses/[id]/study/quiz">) {
  const { id: courseId } = await ctx.params;
  if (!isUuid(courseId)) return jsonError("Cours introuvable", 404);

  const body = await readJsonBody<{ topic: unknown }>(request); // 64 Ko max, JSON objet
  if (body instanceof Response) return body;
  const topic = cleanText(body.topic, 500);                     // vérifier CHAQUE champ

  const auth = await requireUser();                              // 401 si non connecté
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;                               // supabase = client RLS de l'utilisateur

  const course = await requireOwnedCourse(supabase, courseId);  // IDOR : le cours est-il à lui ?
  if (!course) return jsonError("Cours introuvable", 404);

  const limited = await enforceRateLimits(user.id, RATE_LIMITS.study); // AVANT l'appel à l'IA
  if (!limited.ok) return rateLimitResponse(limited);            // 429 + Retry-After

  // ... prompt : contenu des documents / de l'utilisateur toujours via untrusted(...) ou formatSources(...)
}
```

## API

### `rate-limit.ts` (serveur uniquement)
- `enforceRateLimits(userId, rules: RateRule[]) → { ok: true } | { ok: false, retryAfterSec, message }`
  Compte un appel pour chaque règle ; refusé si l'une est dépassée. `message` est prêt à afficher (français).
- `enforceRateLimit(userId, bucket, { limit, windowSec })` : une seule règle.
- `RATE_LIMITS` : préréglages `chat`, `summary`, `annotationReply`, `analyze`, `ingest`, **`study`** (outils d'étude :
  6/min, 60/h, 200/jour). Chacun inclut aussi le plafond global `llm:all:day` (600 appels IA/jour/utilisateur).
- `rateLimitResponse(result)` : réponse 429 JSON `{ error }` avec `Retry-After`.
- Stockage : table `public.rate_limits` + fonction `public.rate_limit_hit` (migration
  `20261110000100_security_hardening.sql`), appelée avec le client admin. Si elle est indisponible : repli
  automatique sur un compteur en mémoire (un avertissement dans les logs), le site n'est jamais bloqué.
- Noms de compteur : `^[a-z0-9:_.-]{1,64}$`.

### `request.ts` (serveur uniquement)
- `requireUser() → { user: { id, email }, supabase } | Response(401)`
- `requireOwnedCourse(supabase, courseId) → { id, title, user_id } | null` (vérifie aussi le format UUID).
- `isUuid(value)`, `jsonError(message, status)`, `readJsonBody(request, maxBytes = 64 Ko)`,
  `cleanText(value, max)` (chaîne, sans caractères de contrôle/invisibles, coupée), `oneOf(value, allowed, fallback)`.
- Dans une Server Action : `getCurrentUser()` (`@/lib/auth`) puis `createClient()` ; même logique
  (`requireOwnedCourse`, `enforceRateLimits`, renvoyer `{ error: limited.message }`).

### `llm.ts` (partout)
- `untrusted(label, text, max?)` : entoure un contenu non fiable de `<<<DÉBUT label>>> … <<<FIN label>>>` et
  neutralise les balises qu'il contiendrait. À utiliser pour tout texte venant d'un document, d'une page web
  ou de l'utilisateur placé dans un prompt. `formatSources()` (`@/lib/course/sources`) le fait déjà pour les extraits.
- `PROMPT_SECURITY_RULES` : bloc à ajouter à la fin de toute consigne système qui reçoit du contenu non fiable
  (déjà inclus dans `COMMON` de `src/lib/course/prompts.ts`).
- `neutralizeDelimiters(text)`, `LLM_INPUT_LIMITS` (longueurs max : question, note, passage, titre).

### `zip.ts` (serveur uniquement)
- `assertSafeZip(bytes, { maxTotalBytes, maxEntries })` : lève `UnsafeArchiveError` si une archive (DOCX, PPTX…)
  se décompresse en un volume démesuré. À appeler avant mammoth / JSZip.

### `redirect.ts` (partout)
- `safeRedirectPath(next, fallback = "/")` : chemin interne sûr pour `?next=` (refuse `https://`, `//site`, `/\site`).

## Règles à respecter
- **Jamais** le client admin (`@/lib/supabase/admin`, contourne la RLS) pour des données dont l'id vient du
  navigateur : utiliser le client de l'utilisateur. Le client admin est réservé au traitement en arrière-plan.
- Toute nouvelle table : `user_id uuid not null default auth.uid()`, RLS activée, politique
  `user_id = (select auth.uid())` en `using` **et** `with check`, et vérifier dans un déclencheur (ou dans la
  politique) que les lignes référencées (cours, document…) appartiennent au même utilisateur
  (voir `public.check_owned_refs()`).
- Ne jamais renvoyer `error.message` d'une exception au navigateur : message générique + `console.error`.
- Sortie des IA : affichée uniquement via le composant `Markdown` (pas de HTML brut, pas de `dangerouslySetInnerHTML`).

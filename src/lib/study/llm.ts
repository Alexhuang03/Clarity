import "server-only";
import { safeError } from "@/lib/security/log";
import type { ModelId } from "@/lib/ai/models";
import { streamWithFallback, type ChatMessage } from "@/lib/ai/providers";
import { repairMessage } from "./prompts";
import { extractJson, parse, type Schema } from "./validate";

/** Erreur montrée telle quelle à l'utilisateur, avec son statut HTTP. */
export class StudyError extends Error {
  constructor(
    message: string,
    public status = 400,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

// Délai maximal d'un appel (la chaîne de modèles comprise)
const CALL_TIMEOUT_MS = 120_000;
// Réponse invalide renvoyée au modèle pour correction : inutile de tout renvoyer
const REPAIR_ECHO_MAX = 12_000;

async function call(chain: ModelId[], system: string, messages: ChatMessage[], maxTokens: number, temperature: number) {
  let model: ModelId | null = null;
  let text = "";
  for await (const chunk of streamWithFallback(
    chain,
    { system, messages, maxTokens, temperature, json: true, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    (m) => (model = m),
  )) {
    if (chunk.type === "text") text += chunk.text;
  }
  return { text, model: model as ModelId | null };
}

function validate<T>(schema: Schema<T>, text: string): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (error) {
    return { ok: false, error: `JSON illisible : ${(error as Error).message}` };
  }
  return parse(schema, json);
}

/**
 * Demande un JSON strict à l'IA et le valide :
 * 1. génération (chaîne de modèles avec bascule automatique) ;
 * 2. si invalide : le même modèle corrige sa réponse ;
 * 3. si toujours invalide : nouvelle génération avec les autres modèles de la chaîne.
 */
export async function generateJson<T>(
  chain: ModelId[],
  req: {
    system: string;
    user: string;
    maxTokens: number;
    temperature?: number;
    /** Appelé avant chaque appel supplémentaire (correction, autre modèle) : y revérifier la limite de débit */
    beforeRetry?: () => Promise<void>;
  },
  schema: Schema<T>,
  label: string,
): Promise<{ value: T; model: ModelId | null }> {
  const temperature = req.temperature ?? 0.5;
  const messages: ChatMessage[] = [{ role: "user", content: req.user }];
  let lastError = "";
  try {
    const first = await call(chain, req.system, messages, req.maxTokens, temperature);
    const r1 = validate(schema, first.text);
    if (r1.ok) return { value: r1.value, model: first.model };
    lastError = r1.error;
    console.warn(`[révision] ${label} : réponse invalide de ${first.model} (${r1.error}), correction demandée`);

    await req.beforeRetry?.();
    const sameFirst = first.model ? [first.model, ...chain.filter((m) => m !== first.model)] : chain;
    const repaired = await call(
      sameFirst,
      req.system,
      [
        ...messages,
        { role: "assistant", content: first.text.slice(0, REPAIR_ECHO_MAX) || "(réponse vide)" },
        { role: "user", content: repairMessage(r1.error) },
      ],
      req.maxTokens,
      0.2,
    );
    const r2 = validate(schema, repaired.text);
    if (r2.ok) return { value: r2.value, model: repaired.model };
    lastError = r2.error;
    console.warn(`[révision] ${label} : correction invalide (${r2.error}), autre modèle`);

    const others = chain.filter((m) => m !== first.model && m !== repaired.model);
    if (others.length) {
      await req.beforeRetry?.();
      const retry = await call(others, req.system, messages, req.maxTokens, temperature);
      const r3 = validate(schema, retry.text);
      if (r3.ok) return { value: r3.value, model: retry.model };
      lastError = r3.error;
    }
  } catch (error) {
    // Limite de débit atteinte entre deux essais : message tel quel (429)
    if (error instanceof StudyError) throw error;
    console.error(`[révision] ${label} : génération échouée`, safeError(error));
    const message = error instanceof Error ? error.message : "";
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      throw new StudyError("Les IA gratuites sont saturées pour le moment. Réessaie dans une minute.", 503);
    }
    if (/timeout|aborted|aucune réponse/i.test(message)) {
      throw new StudyError("L'IA a mis trop de temps à répondre. Réessaie (ou réduis la sélection).", 504);
    }
    throw new StudyError("La génération a échoué. Réessaie.", 502);
  }
  console.error(`[révision] ${label} : réponses invalides après 3 essais (${lastError})`);
  throw new StudyError("L'IA a renvoyé un résultat inutilisable. Réessaie.", 502);
}

import type { Locale } from "../config";
import { en } from "./en";
import { fr, type Dictionary } from "./fr";
import { zh } from "./zh";

export type { Dictionary };

/** fr est la source : en et zh sont typés contre lui (une clé manquante ou en trop fait échouer tsc). */
export const dictionaries: Record<Locale, Dictionary> = { fr, en, zh };

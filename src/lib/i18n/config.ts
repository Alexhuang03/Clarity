// Langues de l'interface. Sans dépendance serveur : importable partout (serveur, client, actions).

export const LOCALES = ["fr", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Cookie qui retient la langue choisie (posé par l'action setLocale, lu par getLocale). */
export const LOCALE_COOKIE = "clarity_locale";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** Nom de chaque langue, écrit dans cette langue (sélecteur). */
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English", zh: "简体中文" };

/** Attribut lang de <html> */
export const HTML_LANG: Record<Locale, string> = { fr: "fr", en: "en", zh: "zh-CN" };

/** Locale des formats de date et de nombre (Intl) */
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB", zh: "zh-CN" };

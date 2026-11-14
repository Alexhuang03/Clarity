"use client";

import { createContext, use, useEffect } from "react";
import { DEFAULT_LOCALE, HTML_LANG, INTL_LOCALE, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Fournit la langue aux composants client. Seul le code de langue traverse la frontière
 * serveur → client : les dictionnaires sont importés de chaque côté (ils contiennent des fonctions).
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Après un changement de langue (rafraîchissement du routeur), <html lang> suit
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return use(LocaleContext);
}

/**
 * Dictionnaire de la langue affichée, hors composant React (messages d'erreur d'un appel réseau...).
 * Lit <html lang>, tenu à jour par I18nProvider. Côté serveur : le français.
 */
export function currentDictionary(): Dictionary {
  if (typeof document === "undefined") return dictionaries[DEFAULT_LOCALE];
  const lang = document.documentElement.lang;
  return dictionaries[lang.startsWith("zh") ? "zh" : lang.startsWith("en") ? "en" : "fr"];
}

/** Textes de l'interface : const { t } = useT(); t.dashboard.title ; t.dashboard.courses(3) */
export function useT(): { t: Dictionary; locale: Locale; intl: string } {
  const locale = use(LocaleContext);
  return { t: dictionaries[locale], locale, intl: INTL_LOCALE[locale] };
}

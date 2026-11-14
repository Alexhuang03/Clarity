"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/account/locale-actions";
import { useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAMES, isLocale } from "@/lib/i18n/config";

/**
 * Choix de la langue de l'interface. L'action serveur setLocale pose le cookie clarity_locale
 * (et l'enregistre dans le compte si l'utilisateur est connecté) ; la page est ensuite rafraîchie.
 * compact : petite pastille (pages de connexion) ; sinon un champ de formulaire (Mon compte).
 */
export function LanguageSwitcher({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={`relative inline-flex items-center ${pending ? "opacity-60" : ""} ${
        compact ? "h-8 rounded-full text-sm text-muted transition hover:bg-surface-2 hover:text-foreground" : ""
      } ${className}`}
    >
      <span className="sr-only">{t.common.language}</span>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className={`pointer-events-none absolute h-4 w-4 ${compact ? "left-2" : "left-3 text-muted"}`}
      >
        <circle cx="10" cy="10" r="7.25" />
        <path d="M2.75 10h14.5M10 2.75c2 2.1 3 4.5 3 7.25s-1 5.15-3 7.25c-2-2.1-3-4.5-3-7.25s1-5.15 3-7.25Z" />
      </svg>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!isLocale(next) || next === locale) return;
          startTransition(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
        className={
          compact
            ? "h-8 cursor-pointer appearance-none rounded-full bg-transparent pl-7 pr-3 text-sm outline-none"
            : "field cursor-pointer appearance-none pl-9"
        }
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

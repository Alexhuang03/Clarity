import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { LEGAL_INFO } from "@/components/legal/content";
import { I18nProvider } from "@/lib/i18n/client";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Police d'accent (titres en italique, classe font-display) : auto-hébergée par next/font, pas de requête externe
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Clarity",
  description: "Réviser ses cours avec une IA qui explique comme à un débutant",
};

// Exécuté avant le premier affichage : applique le thème enregistré (ou celui du système)
// pour éviter un flash de la mauvaise couleur. Sans choix enregistré, suit les changements du système.
// Pose aussi <html lang> d'après le cookie de langue (la mise en page reste statique : pas de cookies() ici).
const THEME_SCRIPT = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)"),d=document.documentElement;function s(){var t=localStorage.getItem("theme");d.dataset.theme=t==="light"||t==="dark"?t:m.matches?"dark":"light"}s();m.addEventListener("change",s);var l=document.cookie.match(/(?:^|; )${LOCALE_COOKIE}=(fr|en|zh)(?:;|$)/);if(l)d.lang=l[1]==="zh"?"zh-CN":l[1]}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme est posé par THEME_SCRIPT avant React : la différence avec le rendu serveur est attendue
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* type text/plain côté client : React ne signale pas de <script> au rendu, et le navigateur
            ne le réexécute pas (il a déjà tourné au chargement de la page) */}
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* La langue vient d'un cookie (lecture dynamique) : tout le contenu est rendu sous ce Suspense */}
        <Suspense fallback={<div className="flex-1" />}>
          <LocaleRoot>{children}</LocaleRoot>
        </Suspense>
      </body>
    </html>
  );
}

async function LocaleRoot({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getT();
  return (
    <I18nProvider locale={locale}>
      {children}
      {/* Mention exigée par Riot Games pour les projets de fans (pings et émotes, voir THIRD_PARTY_NOTICES.md) */}
      <footer className="px-4 pb-4 pt-8 text-center text-[0.65rem] leading-relaxed text-muted opacity-70">
        {t.footer.riot}
        <br />
        <Link href="/legal" className="underline-offset-4 hover:text-foreground hover:underline">
          {t.footer.legal}
        </Link>
        {" · "}
        {/* Lien simple : l'onglet de /legal suit l'ancre (événement hashchange), y compris depuis /legal */}
        <a href="/legal#droits" className="underline-offset-4 hover:text-foreground hover:underline">
          {t.footer.copyright}
        </a>
        <br />© 2026 {LEGAL_INFO.publisher}
      </footer>
    </I18nProvider>
  );
}

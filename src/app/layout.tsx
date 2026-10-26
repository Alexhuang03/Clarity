import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clarity",
  description: "Réviser ses cours avec une IA qui explique comme à un débutant",
};

// Exécuté avant le premier affichage : applique le thème enregistré (ou celui du système)
// pour éviter un flash de la mauvaise couleur. Sans choix enregistré, suit les changements du système.
const THEME_SCRIPT = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)"),d=document.documentElement;function s(){var t=localStorage.getItem("theme");d.dataset.theme=t==="light"||t==="dark"?t:m.matches?"dark":"light"}s();m.addEventListener("change",s)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme est posé par THEME_SCRIPT avant React : la différence avec le rendu serveur est attendue
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        {children}
        {/* Mention exigée par Riot Games pour les projets de fans (pings et émotes, voir THIRD_PARTY_NOTICES.md) */}
        <footer className="px-4 pb-4 pt-8 text-center text-[0.65rem] leading-relaxed opacity-40">
          Icônes de pings, sons et émotes © Riot Games, Inc., via le projet lolPing. Clarity n&apos;est pas approuvé par
          Riot Games et ne reflète pas les opinions de Riot Games.
        </footer>
      </body>
    </html>
  );
}

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
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

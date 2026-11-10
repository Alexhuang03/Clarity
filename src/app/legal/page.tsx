import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LegalPage } from "./legal-page";

export const metadata: Metadata = {
  title: "Cadre légal & confidentialité — Clarity",
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>
      <p className="eyebrow">Informations</p>
      <h1 className="mb-6 mt-1 font-display text-3xl italic sm:text-4xl">Cadre légal &amp; confidentialité</h1>
      <LegalPage />
    </main>
  );
}

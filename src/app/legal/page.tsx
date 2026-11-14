import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LegalPage } from "./legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.legal.title} — Clarity` };
}

export default async function Page() {
  const { t } = await getT();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>
      </div>
      <p className="eyebrow">{t.legal.eyebrow}</p>
      <h1 className="mb-6 mt-1 font-display text-3xl italic sm:text-4xl">{t.legal.title}</h1>
      <LegalPage />
    </main>
  );
}

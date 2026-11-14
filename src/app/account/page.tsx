import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { loadLolPrefs } from "@/lib/annotations/prefs-server";
import { createClient } from "@/lib/supabase/server";
import BlurText from "@/components/reactbits/BlurText";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getT } from "@/lib/i18n/server";
import { signOut } from "../actions";
import { ChangePasswordForm, DeleteAccountForm } from "./forms";
import { LolSettings } from "./lol-settings";
import { SummaryDetailSetting, type SummaryDetail } from "./summary-detail";

export default async function AccountPage() {
  const { t } = await getT();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="btn btn-ghost -ml-3 px-3 py-1.5 font-normal">
          <span aria-hidden>←</span> {t.common.myCourses}
        </Link>
        <ThemeToggle />
      </div>
      <p className="eyebrow mt-8">{t.account.eyebrow}</p>
      <BlurText
        key={t.account.title}
        as="h1"
        text={t.account.title}
        trigger="load"
        delay={90}
        distance={14}
        className="mt-2 text-3xl font-semibold tracking-tight"
      />
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />}>
        <AccountContent />
      </Suspense>
    </main>
  );
}

async function AccountContent() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const prefs = await loadLolPrefs(supabase);
  // select("*") : la colonne summary_detail peut ne pas exister tant que la migration n'est pas appliquée
  const { data: settings } = await supabase.from("user_settings").select("*").maybeSingle();
  const savedDetail = (settings as { summary_detail?: unknown } | null)?.summary_detail;
  const detail: SummaryDetail =
    savedDetail === "concis" || savedDetail === "tres_detaille" ? savedDetail : "detaille";
  const { t } = await getT();
  return (
    <div className="mt-8 space-y-6">
      <section className="card p-6">
        <h2 className="font-medium">{t.account.email}</h2>
        <p className="mt-1 text-muted">{user.email}</p>
        <form action={signOut} className="mt-4">
          <button className="btn btn-secondary px-3 py-1.5">{t.common.signOut}</button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="font-medium">{t.account.language}</h2>
        <p className="mt-1 text-sm text-muted">{t.account.languageHint}</p>
        <LanguageSwitcher className="mt-4 w-full max-w-xs" />
      </section>

      <section className="card p-6">
        <h2 className="font-medium">{t.account.detailTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.account.detailHint}</p>
        <SummaryDetailSetting initial={detail} />
      </section>

      <div id="pings-emotes" className="scroll-mt-4">
        <LolSettings initial={prefs} />
      </div>

      <section className="card p-6">
        <h2 className="font-medium">{t.account.changePassword}</h2>
        <ChangePasswordForm email={user.email} />
      </section>

      <section className="card !border-red-500/30 p-6">
        <h2 className="font-medium text-danger">{t.account.deleteTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.account.deleteText}</p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { loadLolPrefs } from "@/lib/annotations/prefs-server";
import { createClient } from "@/lib/supabase/server";
import BlurText from "@/components/reactbits/BlurText";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { signOut } from "../actions";
import { ChangePasswordForm, DeleteAccountForm } from "./forms";
import { LolSettings } from "./lol-settings";

export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="btn btn-ghost -ml-3 px-3 py-1.5 font-normal">
          <span aria-hidden>←</span> Mes cours
        </Link>
        <ThemeToggle />
      </div>
      <p className="eyebrow mt-8">Paramètres</p>
      <BlurText
        as="h1"
        text="Mon compte"
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
  const prefs = await loadLolPrefs(await createClient());
  return (
    <div className="mt-8 space-y-6">
      <section className="card p-6">
        <h2 className="font-medium">Email</h2>
        <p className="mt-1 text-muted">{user.email}</p>
        <form action={signOut} className="mt-4">
          <button className="btn btn-secondary px-3 py-1.5">
            Se déconnecter
          </button>
        </form>
      </section>

      <div id="pings-emotes" className="scroll-mt-4">
        <LolSettings initial={prefs} />
      </div>

      <section className="card p-6">
        <h2 className="font-medium">Changer de mot de passe</h2>
        <ChangePasswordForm email={user.email} />
      </section>

      <section className="card !border-red-500/30 p-6">
        <h2 className="font-medium text-danger">Supprimer mon compte</h2>
        <p className="mt-1 text-sm text-muted">
          Supprime définitivement ton compte, tes cours, tes fichiers, tes résumés et tes
          annotations. Cette action est irréversible.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}

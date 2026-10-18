import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "../actions";
import { ChangePasswordForm, DeleteAccountForm } from "./forms";

export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm opacity-70 hover:opacity-100">
        ← Mes cours
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Mon compte</h1>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />}>
        <AccountContent />
      </Suspense>
    </main>
  );
}

async function AccountContent() {
  const user = await getCurrentUser();
  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="font-medium">Email</h2>
        <p className="mt-1 opacity-80">{user.email}</p>
        <form action={signOut} className="mt-4">
          <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Se déconnecter
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="font-medium">Changer de mot de passe</h2>
        <ChangePasswordForm email={user.email} />
      </section>

      <section className="rounded-2xl border border-red-500/30 p-6">
        <h2 className="font-medium text-red-700 dark:text-red-400">Supprimer mon compte</h2>
        <p className="mt-1 text-sm opacity-80">
          Supprime définitivement ton compte, tes cours, tes fichiers, tes résumés et tes
          annotations. Cette action est irréversible.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}

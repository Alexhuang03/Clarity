import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "./actions";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mes cours</h1>
        <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />}>
          <UserMenu />
        </Suspense>
      </header>
      <p className="mt-10 opacity-70">Aucun cours pour l&apos;instant.</p>
    </main>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <Link href="/account" className="opacity-70 hover:underline hover:opacity-100" title="Mon compte">
        {user.email}
      </Link>
      <button className="rounded-lg border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
        Se déconnecter
      </button>
    </form>
  );
}

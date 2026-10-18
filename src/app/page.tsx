import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mes cours</h1>
        <form action={signOut} className="flex items-center gap-3 text-sm">
          <span className="opacity-70">{data?.claims.email}</span>
          <button className="rounded-lg border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Se déconnecter
          </button>
        </form>
      </header>
      <p className="mt-10 opacity-70">Aucun cours pour l&apos;instant.</p>
    </main>
  );
}

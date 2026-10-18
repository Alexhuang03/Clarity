"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Crée le compte s'il n'existe pas encore ; le premier code valide l'adresse email.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (error) return setError("Code invalide ou expiré.");
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 p-8 shadow-sm dark:border-white/15">
        <h1 className="text-2xl font-semibold">Clarity</h1>
        <p className="mt-1 text-sm opacity-70">
          {step === "email"
            ? "Entre ton email pour recevoir un code de connexion."
            : `Code envoyé à ${email}.`}
        </p>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.com"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20"
            />
            <button
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Envoi…" : "Recevoir un code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-center text-2xl tracking-[0.5em] outline-none focus:border-indigo-500 dark:border-white/20"
            />
            <button
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Vérification…" : "Se connecter"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
              className="w-full text-sm opacity-70 hover:opacity-100"
            >
              Changer d&apos;email
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}

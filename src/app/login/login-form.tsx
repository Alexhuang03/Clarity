"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, safeNextPath } from "@/lib/auth-errors";
import {
  AuthCard,
  CodeInput,
  Field,
  Message,
  PasswordInput,
  ResendButton,
  inputClass,
  linkClass,
  primaryButton,
} from "@/components/auth/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function goToNext() {
    router.replace(safeNextPath(searchParams.get("next")));
    router.refresh();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error?.code === "email_not_confirmed") {
      // Compte créé mais jamais vérifié : on renvoie un code et on passe à la vérification.
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
      setLoading(false);
      const recentlySent = resendError?.code === "over_email_send_rate_limit";
      if (resendError && !recentlySent) return setError(authErrorMessage(resendError));
      setInfo(
        recentlySent
          ? `Ton adresse n'est pas encore vérifiée. Utilise le code envoyé à ${email} il y a moins d'une minute.`
          : `Ton adresse n'est pas encore vérifiée. Un code a été envoyé à ${email}.`,
      );
      return setStep("verify");
    }
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    goToNext();
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    goToNext();
  }

  async function resend() {
    setError(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      setError(authErrorMessage(error));
      return false;
    }
    setInfo("Nouveau code envoyé.");
    return true;
  }

  if (step === "verify") {
    return (
      <AuthCard title="Vérifie ton email" subtitle="Saisis le code à 6 chiffres reçu par email.">
        <form onSubmit={verify} className="space-y-3">
          <CodeInput value={code} onChange={setCode} />
          <button disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? "Vérification…" : "Valider"}
          </button>
          <ResendButton onResend={resend} />
        </form>
        <Message type="error">{error}</Message>
        <Message type="info">{info}</Message>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Se connecter"
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/signup" className={linkClass}>
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={signIn} className="space-y-4">
        <Field label="Email">
          {(id) => (
            <input
              id={id}
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder="toi@exemple.com"
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Mot de passe">
          {(id) => (
            <PasswordInput
              id={id}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          )}
        </Field>
        <div className="-mt-2 text-right text-sm">
          <Link href="/forgot-password" className={linkClass}>
            Mot de passe oublié ?
          </Link>
        </div>
        <button disabled={loading} className={primaryButton}>
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
      <Message type="error">{error}</Message>
    </AuthCard>
  );
}

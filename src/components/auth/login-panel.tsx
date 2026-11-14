"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-errors";
import { authErrorText } from "@/lib/i18n/auth";
import { useT } from "@/lib/i18n/client";
import { syncLocaleAfterLogin } from "@/app/account/locale-actions";
import { CodeInput, Field, Message, PasswordInput, ResendButton, inputClass, linkClass, primaryButton } from "./ui";

/** Titre et sous-titre d'un panneau de la carte de connexion / inscription */
export function PanelHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

/**
 * Connexion par email et mot de passe. Compte jamais vérifié : un code est renvoyé et vérifié ici.
 * Ensuite : langue du compte appliquée (syncLocaleAfterLogin), puis redirection vers ?next= (ou l'accueil).
 * Lit ?next= : doit être rendu sous <Suspense>.
 */
export function LoginPanel({ onSwitchToSignup }: { onSwitchToSignup: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(createClient);
  const { t } = useT();
  const authErrorMessage = (e: Parameters<typeof authErrorText>[0]) => authErrorText(e, t);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function goToNext() {
    // La langue enregistrée dans le compte l'emporte : l'action met le cookie à jour
    await syncLocaleAfterLogin().catch(() => null);
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
      setInfo(recentlySent ? t.auth.notVerifiedRecent(email) : t.auth.notVerifiedSent(email));
      return setStep("verify");
    }
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    await goToNext();
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    await goToNext();
  }

  async function resend() {
    setError(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      setError(authErrorMessage(error));
      return false;
    }
    setInfo(t.auth.newCodeSent);
    return true;
  }

  if (step === "verify") {
    return (
      <>
        <PanelHeading title={t.auth.verifyTitle} subtitle={t.auth.verifySubtitle} />
        <form onSubmit={verify} className="space-y-3">
          <CodeInput value={code} onChange={setCode} />
          <button disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? t.auth.verifying : t.auth.validate}
          </button>
          <ResendButton onResend={resend} />
        </form>
        <Message type="error">{error}</Message>
        <Message type="info">{info}</Message>
      </>
    );
  }

  return (
    <>
      <PanelHeading title={t.auth.loginTitle} />
      <form onSubmit={signIn} className="space-y-4">
        <Field label={t.auth.email}>
          {(id) => (
            <input
              id={id}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder={t.auth.emailPlaceholder}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t.auth.password}>
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" />}
        </Field>
        <div className="-mt-2 text-right text-sm">
          <Link href="/forgot-password" className={linkClass}>
            {t.auth.forgotLink}
          </Link>
        </div>
        <button disabled={loading} className={primaryButton}>
          {loading ? t.auth.loggingIn : t.auth.loginTitle}
        </button>
      </form>
      <Message type="error">{error}</Message>
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.noAccount}{" "}
        <button type="button" onClick={onSwitchToSignup} className={linkClass}>
          {t.auth.createAccountLink}
        </button>
      </p>
    </>
  );
}

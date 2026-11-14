"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResetOnLeave } from "@/components/auth/reset-on-leave";
import { createClient } from "@/lib/supabase/client";
import { isPasswordValid } from "@/lib/auth-errors";
import { authErrorText } from "@/lib/i18n/auth";
import { useT } from "@/lib/i18n/client";
import { suggestEmail } from "@/lib/email-check";
import { checkEmailDomain } from "./actions";
import { syncLocaleAfterLogin } from "@/app/account/locale-actions";
import { LegalDialog } from "@/components/legal/legal-dialog";
import { LEGAL_VERSION, type LegalTab } from "@/components/legal/content";
import {
  AuthCard,
  CodeInput,
  Field,
  Message,
  PasswordInput,
  PasswordRules,
  ResendButton,
  inputClass,
  linkClass,
  primaryButton,
} from "@/components/auth/ui";

export default function SignupPage() {
  return (
    <ResetOnLeave>
      <SignupFlow />
    </ResetOnLeave>
  );
}

function SignupFlow() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useT();
  const authErrorMessage = (e: Parameters<typeof authErrorText>[0]) => authErrorText(e, t);
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  const suggestion = suggestEmail(email);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmit = isPasswordValid(password) && passwordsMatch && accepted && !loading;

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    // Évite d'envoyer un email vers un domaine qui n'existe pas (le code n'arriverait jamais)
    const { ok } = await checkEmailDomain(email);
    if (!ok) {
      setLoading(false);
      return setError(t.auth.domainCantReceive(email.split("@")[1] ?? ""));
    }
    // Preuve du consentement (RGPD) : version des textes acceptée et date, gardées dans le compte
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { legal_version: LEGAL_VERSION, legal_accepted_at: new Date().toISOString() } },
    });
    setLoading(false);
    // Selon la version de Supabase, un compte existant donne une erreur explicite
    // ou un utilisateur sans identité (pour ne pas révéler que l'email est inscrit).
    const alreadyExists =
      error?.code === "user_already_exists" ||
      error?.code === "email_exists" ||
      (!error && data.user?.identities?.length === 0);
    if (error && !alreadyExists) return setError(authErrorMessage(error));
    if (alreadyExists) {
      return setError(
        <>
          {t.auth.accountExists}{" "}
          <Link href="/login" className="underline">
            {t.auth.loginLink}
          </Link>{" "}
          {t.auth.or}{" "}
          <Link href="/forgot-password" className="underline">
            {t.auth.resetPasswordLink}
          </Link>
          .
        </>,
      );
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    if (error) {
      setLoading(false);
      return setError(authErrorMessage(error));
    }
    // Sécurité : si quelqu'un d'autre avait déjà inscrit cet email sans le vérifier, Supabase
    // garde SON mot de passe. Le vrai propriétaire vient de prouver qu'il reçoit les emails :
    // on impose donc le mot de passe qu'il a choisi.
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (passwordError && passwordError.code !== "same_password") {
      return setError(authErrorMessage(passwordError));
    }
    // Enregistre dans le nouveau compte la langue choisie avant l'inscription (cookie)
    await syncLocaleAfterLogin().catch(() => null);
    router.replace("/");
    router.refresh();
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

  if (step === "code") {
    return (
      <AuthCard
        title={t.auth.verifyTitle}
        subtitle={
          <>
            {t.auth.signupCodeBefore}
            <strong>{email}</strong>
            {t.auth.signupCodeAfter}
          </>
        }
      >
        <form onSubmit={verify} className="space-y-3">
          <CodeInput value={code} onChange={setCode} />
          <button disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? t.auth.verifying : t.auth.validateAndCreate}
          </button>
          <ResendButton onResend={resend} />
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setCode("");
              setError(null);
              setInfo(null);
            }}
            className="w-full text-sm text-muted transition hover:text-foreground"
          >
            {t.auth.changeEmail}
          </button>
        </form>
        <Message type="error">{error}</Message>
        <Message type="info">{info}</Message>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t.auth.signupTitle}
      subtitle={t.auth.signupSubtitle}
      footer={
        <>
          {t.auth.alreadyAccount}{" "}
          <Link href="/login" className={linkClass}>
            {t.auth.loginLink}
          </Link>
        </>
      }
    >
      <form onSubmit={signUp} className="space-y-4">
        <Field label={t.auth.email}>
          {(id) => (
            <input
              id={id}
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder={t.auth.emailPlaceholder}
              className={inputClass}
            />
          )}
        </Field>
        {suggestion && (
          <p className="-mt-2 text-sm">
            {t.auth.didYouMean}{" "}
            <button type="button" onClick={() => setEmail(suggestion)} className={linkClass}>
              {suggestion}
            </button>{" "}
            ?
          </p>
        )}
        <Field label={t.auth.password}>
          {(id) => (
            <>
              <PasswordInput
                id={id}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <PasswordRules password={password} />
            </>
          )}
        </Field>
        <Field label={t.auth.confirmPassword}>
          {(id) => (
            <>
              <PasswordInput
                id={id}
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs text-danger">
                  {t.auth.passwordsDontMatch}
                </p>
              )}
            </>
          )}
        </Field>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]"
          />
          <span className="text-muted">
            {t.auth.acceptBefore}{" "}
            <button type="button" onClick={() => setLegalTab("cgu")} className={linkClass}>
              {t.auth.terms}
            </button>{" "}
            {t.auth.acceptAnd}{" "}
            <button type="button" onClick={() => setLegalTab("confidentialite")} className={linkClass}>
              {t.auth.privacy}
            </button>
            .
          </span>
        </label>
        <button disabled={!canSubmit} className={primaryButton}>
          {loading ? t.auth.creating : t.auth.createMyAccount}
        </button>
      </form>
      <Message type="error">{error}</Message>
      <LegalDialog open={legalTab !== null} initialTab={legalTab ?? "cgu"} onClose={() => setLegalTab(null)} />
    </AuthCard>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResetOnLeave } from "@/components/auth/reset-on-leave";
import { createClient } from "@/lib/supabase/client";
import { isPasswordValid } from "@/lib/auth-errors";
import { authErrorText } from "@/lib/i18n/auth";
import { useT } from "@/lib/i18n/client";
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

type Step = "email" | "code" | "password";

export default function ForgotPasswordPage() {
  return (
    <ResetOnLeave>
      <ForgotPasswordFlow />
    </ResetOnLeave>
  );
}

function ForgotPasswordFlow() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useT();
  const authErrorMessage = (e: Parameters<typeof authErrorText>[0]) => authErrorText(e, t);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setError(authErrorMessage(error));
      return false;
    }
    // Par sécurité, Supabase ne dit pas si le compte existe.
    setInfo(t.auth.codeSentIfExists(email));
    setStep("code");
    return true;
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Le code ouvre une session temporaire qui permet de changer le mot de passe.
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    setInfo(null);
    setStep("password");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    router.replace("/");
    router.refresh();
  }

  if (step === "password") {
    const canSave = isPasswordValid(password) && password === confirm && !loading;
    return (
      <AuthCard title={t.auth.newPasswordTitle} subtitle={t.auth.forAccount(email)}>
        <form onSubmit={savePassword} className="space-y-4">
          <Field label={t.auth.newPassword}>
            {(id) => (
              <>
                <PasswordInput
                  id={id}
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  autoFocus
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
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-xs text-danger">
                    {t.auth.passwordsDontMatch}
                  </p>
                )}
              </>
            )}
          </Field>
          <button disabled={!canSave} className={primaryButton}>
            {loading ? t.common.saving : t.auth.saveAndLogin}
          </button>
        </form>
        <Message type="error">{error}</Message>
      </AuthCard>
    );
  }

  if (step === "code") {
    return (
      <AuthCard title={t.auth.codeTitle} subtitle={t.auth.codeSubtitle}>
        <form onSubmit={verify} className="space-y-3">
          <CodeInput value={code} onChange={setCode} />
          <button disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? t.auth.verifying : t.auth.validate}
          </button>
          <ResendButton onResend={() => sendCode()} />
          <button
            type="button"
            onClick={() => {
              setStep("email");
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
      title={t.auth.forgotTitle}
      subtitle={t.auth.forgotSubtitle}
      footer={
        <Link href="/login" className={linkClass}>
          {t.auth.backToLogin}
        </Link>
      }
    >
      <form onSubmit={sendCode} className="space-y-4">
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
        <button disabled={loading} className={primaryButton}>
          {loading ? t.auth.sending : t.auth.receiveCode}
        </button>
      </form>
      <Message type="error">{error}</Message>
    </AuthCard>
  );
}

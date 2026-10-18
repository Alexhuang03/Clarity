"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, isPasswordValid } from "@/lib/auth-errors";
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
  const router = useRouter();
  const supabase = createClient();
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
    setInfo(`Si un compte existe pour ${email}, un code vient d'être envoyé.`);
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
      <AuthCard title="Nouveau mot de passe" subtitle={`Pour le compte ${email}.`}>
        <form onSubmit={savePassword} className="space-y-4">
          <Field label="Nouveau mot de passe">
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
          <Field label="Confirme le mot de passe">
            {(id) => (
              <>
                <PasswordInput
                  id={id}
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Les mots de passe ne correspondent pas.
                  </p>
                )}
              </>
            )}
          </Field>
          <button disabled={!canSave} className={primaryButton}>
            {loading ? "Enregistrement…" : "Enregistrer et me connecter"}
          </button>
        </form>
        <Message type="error">{error}</Message>
      </AuthCard>
    );
  }

  if (step === "code") {
    return (
      <AuthCard title="Saisis le code" subtitle="Le code à 6 chiffres reçu par email.">
        <form onSubmit={verify} className="space-y-3">
          <CodeInput value={code} onChange={setCode} />
          <button disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? "Vérification…" : "Valider"}
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
            className="w-full text-sm opacity-70 hover:opacity-100"
          >
            Modifier mon email
          </button>
        </form>
        <Message type="error">{error}</Message>
        <Message type="info">{info}</Message>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="On t'envoie un code par email pour choisir un nouveau mot de passe."
      footer={
        <Link href="/login" className={linkClass}>
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={sendCode} className="space-y-4">
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
        <button disabled={loading} className={primaryButton}>
          {loading ? "Envoi…" : "Recevoir un code"}
        </button>
      </form>
      <Message type="error">{error}</Message>
    </AuthCard>
  );
}

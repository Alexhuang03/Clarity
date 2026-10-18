"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, isPasswordValid } from "@/lib/auth-errors";
import { suggestEmail } from "@/lib/email-check";
import { checkEmailDomain } from "./actions";
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
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [info, setInfo] = useState<string | null>(null);

  const suggestion = suggestEmail(email);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmit = isPasswordValid(password) && passwordsMatch && !loading;

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    // Évite d'envoyer un email vers un domaine qui n'existe pas (le code n'arriverait jamais)
    const { ok } = await checkEmailDomain(email);
    if (!ok) {
      setLoading(false);
      return setError(
        `Le domaine « ${email.split("@")[1]} » ne peut pas recevoir d'emails. Vérifie ton adresse.`,
      );
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
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
          Un compte existe déjà avec cet email.{" "}
          <Link href="/login" className="underline">
            Se connecter
          </Link>{" "}
          ou{" "}
          <Link href="/forgot-password" className="underline">
            réinitialiser le mot de passe
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
    setInfo("Nouveau code envoyé.");
    return true;
  }

  if (step === "code") {
    return (
      <AuthCard
        title="Vérifie ton email"
        subtitle={
          <>
            Saisis le code à 6 chiffres envoyé à <strong>{email}</strong>. Pense à regarder dans
            les spams.
          </>
        }
      >
        <form onSubmit={verify} className="space-y-3">
          <CodeInput value={code} onChange={setCode} />
          <button disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? "Vérification…" : "Valider et créer mon compte"}
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
      title="Créer un compte"
      subtitle="Un code te sera envoyé par email pour vérifier ton adresse."
      footer={
        <>
          Déjà un compte ?{" "}
          <Link href="/login" className={linkClass}>
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={signUp} className="space-y-4">
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
        {suggestion && (
          <p className="-mt-2 text-sm">
            Tu voulais dire{" "}
            <button type="button" onClick={() => setEmail(suggestion)} className={linkClass}>
              {suggestion}
            </button>{" "}
            ?
          </p>
        )}
        <Field label="Mot de passe">
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
        <Field label="Confirme le mot de passe">
          {(id) => (
            <>
              <PasswordInput
                id={id}
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Les mots de passe ne correspondent pas.
                </p>
              )}
            </>
          )}
        </Field>
        <button disabled={!canSubmit} className={primaryButton}>
          {loading ? "Création…" : "Créer mon compte"}
        </button>
      </form>
      <Message type="error">{error}</Message>
    </AuthCard>
  );
}

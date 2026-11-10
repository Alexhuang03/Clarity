"use client";

import { useEffect, useId, useState } from "react";
import { PASSWORD_RULES } from "@/lib/auth-errors";
import BlurText from "@/components/reactbits/BlurText";
import { GridBackground } from "@/components/ui/grid-background";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const inputClass = "field";
export const primaryButton = "btn btn-primary w-full py-2.5";
export const linkClass = "text-accent-text underline-offset-4 hover:underline";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* Fond : grille qui défile lentement + halo d'accent très diffus */}
      <GridBackground moving />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] -z-10 h-72 w-[min(40rem,90vw)] -translate-x-1/2 rounded-full bg-accent-soft blur-3xl"
      />
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo href={null} className="text-lg" />
          <BlurText
            text="Tes cours, expliqués simplement."
            trigger="load"
            delay={70}
            distance={12}
            blur={8}
            className="mt-4 justify-center font-display text-2xl italic text-muted"
          />
        </div>
        <div className="card rise-in p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-20`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs text-muted transition hover:bg-surface-2 hover:text-foreground"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className={`transition-colors ${ok ? "text-success" : "text-muted"}`}>
            {ok ? "✓" : "○"} {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

export function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      required
      autoFocus
      maxLength={6}
      pattern="[0-9]{6}"
      aria-label="Code à 6 chiffres"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="••••••"
      className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
    />
  );
}

// Doit rester aligné avec max_frequency dans supabase/config.toml
const RESEND_DELAY = 60;

export function ResendButton({ onResend }: { onResend: () => Promise<boolean> }) {
  const [remaining, setRemaining] = useState(RESEND_DELAY);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function resend() {
    setSending(true);
    const ok = await onResend();
    setSending(false);
    if (ok) setRemaining(RESEND_DELAY);
  }

  return (
    <button
      type="button"
      disabled={remaining > 0 || sending}
      onClick={resend}
      className="w-full text-sm text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:hover:text-muted"
    >
      {sending
        ? "Envoi…"
        : remaining > 0
          ? `Renvoyer le code (${remaining} s)`
          : "Renvoyer le code"}
    </button>
  );
}

export function Message({ type, children }: { type: "error" | "info"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role={type === "error" ? "alert" : "status"}
      className={`mt-4 rounded-xl px-3 py-2 text-sm ${
        type === "error" ? "bg-red-500/10 text-danger" : "bg-accent-soft text-accent-text"
      }`}
    >
      {children}
    </p>
  );
}

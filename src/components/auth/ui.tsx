"use client";

import { useEffect, useId, useState } from "react";
import { PASSWORD_RULES } from "@/lib/auth-errors";

export const inputClass =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20";
export const primaryButton =
  "w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
export const linkClass = "text-indigo-600 hover:underline dark:text-indigo-400";

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
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight">Clarity</p>
        <div className="rounded-2xl border border-black/10 p-8 shadow-sm dark:border-white/15">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm opacity-70">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm opacity-80">{footer}</div>}
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
    <div className="space-y-1">
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
        className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs opacity-70 hover:opacity-100"
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
          <li key={rule.label} className={ok ? "text-green-600 dark:text-green-400" : "opacity-60"}>
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
      className="w-full text-sm opacity-70 hover:opacity-100 disabled:cursor-not-allowed disabled:hover:opacity-70"
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
      className={`mt-4 rounded-lg px-3 py-2 text-sm ${
        type === "error"
          ? "bg-red-500/10 text-red-700 dark:text-red-400"
          : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
      }`}
    >
      {children}
    </p>
  );
}

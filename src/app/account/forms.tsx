"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, isPasswordValid } from "@/lib/auth-errors";
import {
  Field,
  Message,
  PasswordInput,
  PasswordRules,
  inputClass,
  primaryButton,
} from "@/components/auth/ui";
import { deleteAccount } from "./actions";

export function ChangePasswordForm({ email }: { email: string }) {
  const supabase = createClient();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSave = current.length > 0 && isPasswordValid(password) && password === confirm && !loading;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    // Vérifie le mot de passe actuel avant d'autoriser le changement
    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (checkError) {
      setLoading(false);
      return setError(
        checkError.code === "invalid_credentials"
          ? "Mot de passe actuel incorrect."
          : authErrorMessage(checkError),
      );
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    setCurrent("");
    setPassword("");
    setConfirm("");
    setInfo("Mot de passe modifié.");
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <Field label="Mot de passe actuel">
        {(id) => (
          <PasswordInput id={id} value={current} onChange={setCurrent} autoComplete="current-password" />
        )}
      </Field>
      <Field label="Nouveau mot de passe">
        {(id) => (
          <>
            <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordRules password={password} />
          </>
        )}
      </Field>
      <Field label="Confirme le nouveau mot de passe">
        {(id) => (
          <>
            <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {confirm.length > 0 && password !== confirm && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Les mots de passe ne correspondent pas.
              </p>
            )}
          </>
        )}
      </Field>
      <button disabled={!canSave} className={primaryButton}>
        {loading ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
      <Message type="error">{error}</Message>
      <Message type="info">{info}</Message>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, { error: null });
  const [confirmation, setConfirmation] = useState("");

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <Field label="Tape SUPPRIMER pour confirmer">
        {(id) => (
          <input
            id={id}
            name="confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <button
        disabled={confirmation !== "SUPPRIMER" || pending}
        className="w-full rounded-lg bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Suppression…" : "Supprimer définitivement mon compte"}
      </button>
      <Message type="error">{state.error}</Message>
    </form>
  );
}

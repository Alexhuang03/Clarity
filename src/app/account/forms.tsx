"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPasswordValid } from "@/lib/auth-errors";
import { authErrorText } from "@/lib/i18n/auth";
import { useT } from "@/lib/i18n/client";
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
  const { t } = useT();
  const authErrorMessage = (e: Parameters<typeof authErrorText>[0]) => authErrorText(e, t);
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
          ? t.account.wrongCurrent
          : authErrorMessage(checkError),
      );
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    setCurrent("");
    setPassword("");
    setConfirm("");
    setInfo(t.account.passwordChanged);
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <Field label={t.account.currentPassword}>
        {(id) => (
          <PasswordInput id={id} value={current} onChange={setCurrent} autoComplete="current-password" />
        )}
      </Field>
      <Field label={t.auth.newPassword}>
        {(id) => (
          <>
            <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordRules password={password} />
          </>
        )}
      </Field>
      <Field label={t.account.confirmNewPassword}>
        {(id) => (
          <>
            <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {confirm.length > 0 && password !== confirm && (
              <p className="text-xs text-danger">
                {t.auth.passwordsDontMatch}
              </p>
            )}
          </>
        )}
      </Field>
      <button disabled={!canSave} className={primaryButton}>
        {loading ? t.common.saving : t.account.changePasswordButton}
      </button>
      <Message type="error">{error}</Message>
      <Message type="info">{info}</Message>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, { error: null });
  const [confirmation, setConfirmation] = useState("");
  const { t } = useT();

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <Field label={t.account.deleteConfirmLabel}>
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
        className="btn w-full bg-red-600 py-2.5 text-white hover:bg-red-500"
      >
        {pending ? t.account.deleting : t.account.deleteButton}
      </button>
      <Message type="error">{state.error}</Message>
    </form>
  );
}

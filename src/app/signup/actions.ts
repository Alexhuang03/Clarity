"use server";

import { resolve4, resolve6, resolveMx } from "node:dns/promises";

const DNS_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), DNS_TIMEOUT_MS)),
  ]);
}

async function hasRecords(lookup: Promise<unknown[]>) {
  try {
    return (await withTimeout(lookup)).length > 0;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    throw e; // panne DNS, timeout... : on ne sait pas
  }
}

/**
 * Vérifie que le domaine de l'email peut recevoir des emails (enregistrement MX,
 * ou à défaut une adresse IP, comme le prévoit la norme SMTP).
 * En cas de panne DNS, on laisse passer pour ne pas bloquer l'inscription.
 */
export async function checkEmailDomain(email: string): Promise<{ ok: boolean }> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".")) return { ok: false };
  try {
    if (await hasRecords(resolveMx(domain))) return { ok: true };
    const hasAddress = (await hasRecords(resolve4(domain))) || (await hasRecords(resolve6(domain)));
    return { ok: hasAddress };
  } catch {
    return { ok: true };
  }
}

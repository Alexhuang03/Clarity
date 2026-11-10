"use client";

import { Fragment, useLayoutEffect, useState } from "react";

/**
 * Next.js garde les dernières pages visitées en mémoire (Activity, avec Cache Components) : sans ça,
 * revenir sur l'inscription ou la connexion réafficherait l'étape « code » et l'email d'avant
 * (ex. après la suppression du compte). Le contenu repart de zéro dès qu'on quitte la page.
 */
export function ResetOnLeave({ children }: { children: React.ReactNode }) {
  const [generation, setGeneration] = useState(0);
  // Le nettoyage s'exécute quand la page est cachée (ou démontée) : la clé change, l'état est remis à zéro
  useLayoutEffect(() => () => setGeneration((g) => g + 1), []);
  return <Fragment key={generation}>{children}</Fragment>;
}

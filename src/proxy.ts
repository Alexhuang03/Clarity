import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Tout sauf les fichiers statiques (le point est échappé : « \\. » dans la chaîne = « \. » dans le motif,
  // sinon « /share/xxxpng » serait pris pour une image et sauterait le proxy). Les routes d'API vérifient
  // de toute façon la session elles-mêmes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|lol/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wav|ogg|mp3)$).*)"],
};

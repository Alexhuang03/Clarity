import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client avec la clé secrète : contourne RLS. Uniquement côté serveur, pour les opérations
// d'administration (ex. suppression de compte). Ne jamais l'exposer au navigateur.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

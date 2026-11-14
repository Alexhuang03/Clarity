import { Suspense } from "react";
import { AuthLanding } from "@/components/auth/landing";
import { ResetOnLeave } from "@/components/auth/reset-on-leave";

// Page publique de présentation, avec la connexion et l'inscription tout en bas (onglet Connexion)
export default function LoginPage() {
  // useSearchParams (lecture de ?next=) doit être sous <Suspense> avec Cache Components
  return (
    <Suspense>
      <ResetOnLeave>
        <AuthLanding initialTab="login" />
      </ResetOnLeave>
    </Suspense>
  );
}

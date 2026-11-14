import { Suspense } from "react";
import { AuthLanding } from "@/components/auth/landing";
import { ResetOnLeave } from "@/components/auth/reset-on-leave";

/**
 * Même page que /login, onglet Inscription ouvert et carte affichée directement. Pas de redirection :
 * les liens existants (emails, suppression du compte...) et ?next= restent valables tels quels.
 */
export default function SignupPage() {
  return (
    <Suspense>
      <ResetOnLeave>
        <AuthLanding initialTab="signup" />
      </ResetOnLeave>
    </Suspense>
  );
}

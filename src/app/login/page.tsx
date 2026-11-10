import { Suspense } from "react";
import { ResetOnLeave } from "@/components/auth/reset-on-leave";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  // useSearchParams (lecture de ?next=) doit être sous <Suspense> avec Cache Components
  return (
    <Suspense>
      <ResetOnLeave>
        <LoginForm />
      </ResetOnLeave>
    </Suspense>
  );
}

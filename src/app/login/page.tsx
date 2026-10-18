import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  // useSearchParams (lecture de ?next=) doit être sous <Suspense> avec Cache Components
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

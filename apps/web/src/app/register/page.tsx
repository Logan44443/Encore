import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Join" };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}

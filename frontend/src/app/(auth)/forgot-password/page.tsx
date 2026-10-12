import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/PasswordReset";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

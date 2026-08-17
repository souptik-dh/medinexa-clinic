import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | Jido Healthcare",
  description: "Request a password reset link",
};

export default function ResetPasswordPage() {
  return <ForgotPasswordForm />;
}

import NewPasswordForm from "@/components/auth/NewPasswordForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Set New Password | Jido Healthcare",
  description: "Choose a new password for your Jido Healthcare account",
};

export default function NewPasswordPage() {
  return (
    <Suspense>
      <NewPasswordForm />
    </Suspense>
  );
}

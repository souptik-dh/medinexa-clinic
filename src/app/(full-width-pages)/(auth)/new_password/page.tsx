import NewPasswordForm from "@/components/auth/NewPasswordForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Set New Password | Medinexa",
  description: "Choose a new password for your Medinexa account",
};

export default function NewPasswordPage() {
  return (
    <Suspense>
      <NewPasswordForm />
    </Suspense>
  );
}

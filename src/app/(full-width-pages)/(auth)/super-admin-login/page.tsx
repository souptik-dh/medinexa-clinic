import SuperAdminSignInForm from "@/components/auth/SuperAdminSignInForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Jido Healthcare - Super Admin SignIn",
  description: "Restricted sign-in for the Jido Healthcare platform console",
};

export default function SuperAdminSignIn() {
  return (
    <Suspense>
      <SuperAdminSignInForm />
    </Suspense>
  );
}

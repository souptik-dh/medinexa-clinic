import AcceptDoctorInviteForm from "@/components/auth/AcceptDoctorInviteForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Accept Invitation | Jido Healthcare",
  description: "Activate your Jido Healthcare doctor account",
};

export default function AcceptDoctorInvitePage() {
  return (
    <Suspense>
      <AcceptDoctorInviteForm />
    </Suspense>
  );
}

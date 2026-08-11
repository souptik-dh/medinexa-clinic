import AcceptDoctorInviteForm from "@/components/auth/AcceptDoctorInviteForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Accept Invitation | Medinexa",
  description: "Activate your Medinexa doctor account",
};

export default function AcceptDoctorInvitePage() {
  return (
    <Suspense>
      <AcceptDoctorInviteForm />
    </Suspense>
  );
}

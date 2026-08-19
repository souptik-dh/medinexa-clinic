import InviteDoctorForm from "@/components/doctors/InviteDoctorForm";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Invite Doctor | Jido Healthcare",
  description: "Send a doctor invitation to join a branch",
};

export default function InviteDoctorPage() {
  return (
    <div>
      <InviteDoctorForm />
    </div>
  );
}

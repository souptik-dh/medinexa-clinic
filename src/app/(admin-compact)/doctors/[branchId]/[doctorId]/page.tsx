import DoctorProfilePanel from "@/components/doctors/DoctorProfilePanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Doctor Profile | Jido Healthcare",
  description: "View a doctor's profile, photo and availability",
};

export default function DoctorProfilePage() {
  return (
    <div>
      <DoctorProfilePanel />
    </div>
  );
}

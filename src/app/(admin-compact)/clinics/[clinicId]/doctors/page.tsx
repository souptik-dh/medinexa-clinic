import ClinicDoctorsPanel from "@/components/clinics/ClinicDoctorsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Doctors | Jido Healthcare",
  description: "View and manage doctors across all branches of a clinic",
};

export default function ClinicDoctorsPage() {
  return (
    <div>
      <ClinicDoctorsPanel />
    </div>
  );
}

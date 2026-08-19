import ClinicOverviewPanel from "@/components/clinics/ClinicOverviewPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Overview | Jido Healthcare",
  description: "Summary of a clinic's branches, doctors, and lab tests",
};

export default function ClinicOverviewPage() {
  return (
    <div>
      <ClinicOverviewPanel />
    </div>
  );
}

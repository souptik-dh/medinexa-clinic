import ClinicLabTestsPanel from "@/components/clinics/ClinicLabTestsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Lab Tests | Jido Healthcare",
  description: "Manage a clinic's lab test catalog",
};

export default function ClinicLabTestsPage() {
  return (
    <div>
      <ClinicLabTestsPanel />
    </div>
  );
}

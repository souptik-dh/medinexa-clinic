import PatientsPanel from "@/components/patients/PatientsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Patients | Jido Healthcare",
  description: "Browse patients who have booked appointments at a branch",
};

// Part of the unified Clinics module — reachable from the Patients tab.
export default function ClinicPatientsPage() {
  return (
    <div>
      <PatientsPanel />
    </div>
  );
}

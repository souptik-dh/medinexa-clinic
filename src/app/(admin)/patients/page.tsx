import PatientsPanel from "@/components/patients/PatientsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Patients | Jido Healthcare",
  description: "Browse patients who have booked appointments at a branch",
};

export default function PatientsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Patients" />
      <PatientsPanel />
    </div>
  );
}

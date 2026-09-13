import LabPatientsPanel from "@/components/patients/LabPatientsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Patients — Lab | Jido Healthcare",
  description: "Browse patients seen through lab test bookings",
};

export default function LabPatientsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Patients — Lab" />
      <LabPatientsPanel />
    </div>
  );
}

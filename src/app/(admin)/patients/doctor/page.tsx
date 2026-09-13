import DoctorPatientsPanel from "@/components/patients/DoctorPatientsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Patients — Doctor | Jido Healthcare",
  description: "Browse patients seen through doctor appointments",
};

export default function DoctorPatientsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Patients — Doctor" />
      <DoctorPatientsPanel />
    </div>
  );
}

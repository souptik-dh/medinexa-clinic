import ClinicsPanel from "@/components/clinics/ClinicsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinics | Jido Healthcare",
  description: "Manage clinics and branches",
};

export default function ClinicsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Clinics" />
      <ClinicsPanel />
    </div>
  );
}

import PrescriptionsPanel from "@/components/prescriptions/PrescriptionsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Prescriptions | Jido Healthcare",
  description: "View appointment prescriptions and download PDFs",
};

export default function PrescriptionsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Prescriptions" />
      <PrescriptionsPanel />
    </div>
  );
}

import LabTestsPanel from "@/components/lab-tests/LabTestsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Lab Tests | Jido Healthcare",
  description: "Manage a clinic's lab test catalog",
};

export default function ClinicLabTestsPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Lab Tests"
        items={[{ label: "Clinics", href: "/clinics" }]}
      />
      <Suspense fallback={null}>
        <LabTestsPanel />
      </Suspense>
    </div>
  );
}

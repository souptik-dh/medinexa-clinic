import ClinicOverviewPanel from "@/components/clinics/ClinicOverviewPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Clinic Overview | Jido Healthcare",
  description: "Summary of a clinic's branches, doctors, and lab tests",
};

export default function ClinicOverviewPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Overview"
        items={[{ label: "Clinics", href: "/clinics" }]}
      />
      <Suspense fallback={null}>
        <ClinicOverviewPanel />
      </Suspense>
    </div>
  );
}

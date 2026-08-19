import ClinicBranchesPanel from "@/components/clinics/ClinicBranchesPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Branches | Jido Healthcare",
  description: "Manage a clinic's branches",
};

export default function ClinicBranchesPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Branches"
        items={[{ label: "Clinics", href: "/clinics" }]}
      />
      <Suspense fallback={null}>
        <ClinicBranchesPanel />
      </Suspense>
    </div>
  );
}

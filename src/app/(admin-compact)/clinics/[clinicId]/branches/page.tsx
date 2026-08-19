import ClinicBranchesPanel from "@/components/clinics/ClinicBranchesPanel";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Branches | Jido Healthcare",
  description: "Manage a clinic's branches",
};

export default function ClinicBranchesPage() {
  return (
    <div>
      <Suspense fallback={null}>
        <ClinicBranchesPanel />
      </Suspense>
    </div>
  );
}

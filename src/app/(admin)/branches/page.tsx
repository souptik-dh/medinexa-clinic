import BranchesPanel from "@/components/branches/BranchesPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Branches | Medinexa",
  description: "Create, list, and edit clinic branches",
};

export default function BranchesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Branches" />
      <BranchesPanel />
    </div>
  );
}

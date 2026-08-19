import BranchOverviewPanel from "@/components/branches/BranchOverviewPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Branch Overview | Jido Healthcare",
  description: "Summary of a branch's doctors, lab tests, and schedule",
};

export default function BranchOverviewPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Overview"
        items={[{ label: "Branches", href: "/branches" }]}
      />
      <BranchOverviewPanel />
    </div>
  );
}

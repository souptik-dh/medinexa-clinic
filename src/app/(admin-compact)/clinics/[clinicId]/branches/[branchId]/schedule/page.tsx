import BranchSchedulePanel from "@/components/branches/BranchSchedulePanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Schedule | Jido Healthcare",
  description: "Manage branch operating days and closures",
};

export default function BranchSchedulePage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Clinic Schedule"
        items={[{ label: "Branches", href: "/branches" }]}
      />
      <BranchSchedulePanel />
    </div>
  );
}

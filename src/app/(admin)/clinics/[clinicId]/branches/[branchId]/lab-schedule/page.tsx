import BranchLabSchedulePanel from "@/components/lab-tests/BranchLabSchedulePanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Lab Schedule | Jido Healthcare",
  description: "Manage a branch's weekly lab test schedule",
};

export default function BranchLabSchedulePage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Lab Schedule"
        items={[{ label: "Branches", href: "/branches" }]}
      />
      <BranchLabSchedulePanel />
    </div>
  );
}

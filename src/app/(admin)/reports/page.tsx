import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ReportsPanel from "@/components/reports/ReportsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Reports | Jido Healthcare",
  description: "Clinic reports and analytics",
};

export default function ReportsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Reports" />
      <ReportsPanel />
    </div>
  );
}

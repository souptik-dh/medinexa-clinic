import PageBreadcrumb from "@/components/common/PageBreadCrumb";
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
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Reports are coming soon.
      </div>
    </div>
  );
}

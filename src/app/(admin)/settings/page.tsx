import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Settings | Jido Healthcare",
  description: "Account and application settings",
};

export default function SettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Settings" />
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Settings are coming soon.
      </div>
    </div>
  );
}

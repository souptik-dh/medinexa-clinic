import SuperAdminSettingsPanel from "@/components/superadmin/SuperAdminSettingsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Platform Settings | Jido Healthcare",
  description: "Editable platform configuration values",
};

export default function SuperAdminSettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Platform Settings" />
      <SuperAdminSettingsPanel />
    </div>
  );
}

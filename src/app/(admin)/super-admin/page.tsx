import PlatformStatisticsPanel from "@/components/superadmin/PlatformStatisticsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Platform Statistics | Jido Healthcare",
  description: "Super admin overview of clinics and subscription revenue",
};

export default function SuperAdminPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Platform Statistics" />
      <PlatformStatisticsPanel />
    </div>
  );
}

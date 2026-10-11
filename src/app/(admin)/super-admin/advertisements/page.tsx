import SuperAdminAdsPanel from "@/components/superadmin/SuperAdminAdsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Advertisements | Jido Healthcare",
  description: "Manage Patient App dashboard advertisements and push them to patients",
};

export default function SuperAdminAdvertisementsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Advertisements" />
      <SuperAdminAdsPanel />
    </div>
  );
}

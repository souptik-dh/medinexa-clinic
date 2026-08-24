import SuperAdminPlansPanel from "@/components/superadmin/SuperAdminPlansPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Subscription Plans | Jido Healthcare",
  description: "Plan version history and publishing new prices",
};

export default function SuperAdminPlansPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Subscription Plans" />
      <SuperAdminPlansPanel />
    </div>
  );
}

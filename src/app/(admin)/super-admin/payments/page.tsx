import SuperAdminPaymentsPanel from "@/components/superadmin/SuperAdminPaymentsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Subscription Payments | Jido Healthcare",
  description: "Platform-wide subscription payments",
};

export default function SuperAdminPaymentsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Subscription Payments" />
      <SuperAdminPaymentsPanel />
    </div>
  );
}

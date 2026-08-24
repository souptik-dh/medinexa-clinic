import SuperAdminAuditLogsPanel from "@/components/superadmin/SuperAdminAuditLogsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Audit Logs | Jido Healthcare",
  description: "Immutable audit trail of privileged actions",
};

export default function SuperAdminAuditLogsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Audit Logs" />
      <SuperAdminAuditLogsPanel />
    </div>
  );
}

import StaffPermissionsPanel from "@/components/staff/StaffPermissionsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Staff Permissions | Medinexa",
  description: "Manage a branch staff member's permissions",
};

export default function StaffPermissionsPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Staff Permissions"
        items={[{ label: "Staff", href: "/staff" }]}
      />
      <StaffPermissionsPanel />
    </div>
  );
}

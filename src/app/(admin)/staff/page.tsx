import StaffPanel from "@/components/staff/StaffPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Staff | Jido Healthcare",
  description: "Manage branch staff: invite members and control access",
};

export default function StaffPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Staff" />
      <StaffPanel />
    </div>
  );
}

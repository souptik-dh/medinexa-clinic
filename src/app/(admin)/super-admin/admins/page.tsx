import SuperAdminAdminsPanel from "@/components/superadmin/SuperAdminAdminsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Super Admins | Jido Healthcare",
  description: "Grant and revoke super admin access",
};

export default function SuperAdminAdminsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Super Admins" />
      <SuperAdminAdminsPanel />
    </div>
  );
}

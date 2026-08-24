import SuperAdminClinicsPanel from "@/components/superadmin/SuperAdminClinicsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Management | Jido Healthcare",
  description: "All clinics with subscription controls",
};

export default function SuperAdminClinicsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Clinic Management" />
      <SuperAdminClinicsPanel />
    </div>
  );
}

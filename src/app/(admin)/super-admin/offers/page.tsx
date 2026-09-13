import SuperAdminOffersPanel from "@/components/superadmin/SuperAdminOffersPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Subscription Offers | Jido Healthcare",
  description: "Grant clinics discounted subscription pricing and notify them",
};

export default function SuperAdminOffersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Subscription Offers" />
      <SuperAdminOffersPanel />
    </div>
  );
}

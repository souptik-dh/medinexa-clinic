import BillingPanel from "@/components/billing/BillingPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Billing | Jido Healthcare",
  description: "Manage your clinic's subscription, payments and renewals",
};

export default function BillingPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Subscription & Billing" />
      <BillingPanel />
    </div>
  );
}

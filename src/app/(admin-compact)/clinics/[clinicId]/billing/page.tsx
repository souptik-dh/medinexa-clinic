import BillingPanel from "@/components/billing/BillingPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Billing | Jido Healthcare",
  description: "Manage your clinic's subscription, payments and renewals",
};

// Part of the unified Clinics module — reachable from the Billing tab.
export default function ClinicBillingPage() {
  return (
    <div>
      <BillingPanel />
    </div>
  );
}

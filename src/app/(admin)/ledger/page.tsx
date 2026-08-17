import LedgerPanel from "@/components/ledger/LedgerPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Payment Ledger | Jido Healthcare",
  description: "Monthly payment totals per clinic and branch",
};

export default function LedgerPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Payment Ledger" />
      <LedgerPanel />
    </div>
  );
}

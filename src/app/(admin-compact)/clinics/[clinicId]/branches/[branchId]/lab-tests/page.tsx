import BranchLabTestsPanel from "@/components/lab-tests/BranchLabTestsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Branch Lab Tests | Jido Healthcare",
  description:
    "Configure lab tests for a branch: pricing, availability, and service mode",
};

export default function BranchLabTestsPage() {
  return (
    <div>
      <BranchLabTestsPanel />
    </div>
  );
}

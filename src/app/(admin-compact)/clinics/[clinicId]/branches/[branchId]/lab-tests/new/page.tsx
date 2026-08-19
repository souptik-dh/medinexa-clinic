import BranchLabTestForm from "@/components/lab-tests/BranchLabTestForm";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Configure Branch Lab Test | Jido Healthcare",
  description: "Configure a lab test's price and availability for a branch",
};

export default function NewBranchLabTestPage() {
  return (
    <div>
      <BranchLabTestForm />
    </div>
  );
}

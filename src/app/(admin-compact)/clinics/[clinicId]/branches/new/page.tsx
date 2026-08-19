import BranchForm from "@/components/branches/BranchForm";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "New Branch | Jido Healthcare",
  description: "Create a new branch for a clinic",
};

export default function NewBranchPage() {
  return (
    <div>
      <BranchForm mode="create" />
    </div>
  );
}

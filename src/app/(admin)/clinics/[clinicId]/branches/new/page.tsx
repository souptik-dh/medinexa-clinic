import BranchForm from "@/components/branches/BranchForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "New Branch | Jido Healthcare",
  description: "Create a new branch for a clinic",
};

export default function NewBranchPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="New Branch"
        items={[{ label: "Branches", href: "/branches" }]}
      />
      <BranchForm mode="create" />
    </div>
  );
}

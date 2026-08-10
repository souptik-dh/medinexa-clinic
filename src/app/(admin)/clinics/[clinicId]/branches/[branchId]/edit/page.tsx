import BranchForm from "@/components/branches/BranchForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Edit Branch | Medinexa",
  description: "Update branch details",
};

export default function EditBranchPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Edit Branch"
        items={[{ label: "Branches", href: "/branches" }]}
      />
      <BranchForm mode="edit" />
    </div>
  );
}

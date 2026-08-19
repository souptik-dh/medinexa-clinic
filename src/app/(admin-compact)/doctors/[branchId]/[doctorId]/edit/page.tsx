import DoctorAssignmentEditPanel from "@/components/doctors/DoctorAssignmentEditPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Edit Assignment | Jido Healthcare",
  description: "Update a doctor's fee, certificate and slot template for a branch",
};

export default function EditDoctorAssignmentPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Edit Assignment"
        items={[{ label: "Doctors", href: "/doctors" }]}
      />
      <DoctorAssignmentEditPanel />
    </div>
  );
}

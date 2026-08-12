import ClinicForm from "@/components/clinics/ClinicForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Edit Clinic | Jido Healthcare",
  description: "Update clinic details",
};

export default function EditClinicPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Edit Clinic"
        items={[{ label: "Clinics", href: "/clinics" }]}
      />
      <ClinicForm mode="edit" />
    </div>
  );
}

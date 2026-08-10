import ClinicForm from "@/components/clinics/ClinicForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "New Clinic | Medinexa",
  description: "Create a new clinic",
};

export default function NewClinicPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="New Clinic"
        items={[{ label: "Clinics", href: "/clinics" }]}
      />
      <ClinicForm mode="create" />
    </div>
  );
}

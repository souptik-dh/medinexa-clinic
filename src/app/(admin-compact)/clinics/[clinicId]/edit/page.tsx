import ClinicForm from "@/components/clinics/ClinicForm";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Edit Clinic | Jido Healthcare",
  description: "Update clinic details",
};

export default function EditClinicPage() {
  return (
    <div>
      <ClinicForm mode="edit" />
    </div>
  );
}

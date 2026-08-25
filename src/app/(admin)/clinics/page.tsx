import ClinicsRedirect from "@/components/clinics/ClinicsRedirect";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinics | Jido Healthcare",
  description: "Manage clinics and branches",
};

export default function ClinicsPage() {
  return (
    <div>
      <ClinicsRedirect />
    </div>
  );
}

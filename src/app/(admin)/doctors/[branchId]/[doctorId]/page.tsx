import DoctorProfilePanel from "@/components/doctors/DoctorProfilePanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Doctor Profile | MediBook",
  description: "View a doctor's profile, photo and availability",
};

export default function DoctorProfilePage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Doctor Profile"
        items={[{ label: "Doctors", href: "/doctors" }]}
      />
      <DoctorProfilePanel />
    </div>
  );
}

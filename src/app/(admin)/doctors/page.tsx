import DoctorsPanel from "@/components/doctors/DoctorsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Doctors | Jido Healthcare",
  description: "Manage branch doctors and doctor invitations",
};

export default function DoctorsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Doctors" />
      <DoctorsPanel />
    </div>
  );
}

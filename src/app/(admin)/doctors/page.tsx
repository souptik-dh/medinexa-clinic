import DoctorsPanel from "@/components/doctors/DoctorsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Doctors | Jido Healthcare",
  description: "Manage branch doctors and doctor invitations",
};

export default function DoctorsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Doctors" />
      <Suspense fallback={null}>
        <DoctorsPanel />
      </Suspense>
    </div>
  );
}

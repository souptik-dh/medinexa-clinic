import DoctorPatientsPanel from "@/components/doctor-patients/DoctorPatientsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Doctor's Patients | Jido Healthcare",
  description: "Patients booked with a doctor at a branch on a given day",
};

export default function DoctorPatientsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Doctor's Patients" />
      {/* The panel reads doctor_id/branch_id/date via useSearchParams. */}
      <Suspense fallback={null}>
        <DoctorPatientsPanel />
      </Suspense>
    </div>
  );
}

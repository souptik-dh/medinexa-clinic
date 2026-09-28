import DoctorPatientsPanel from "@/components/appointments/DoctorPatientsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Doctor Patients | Jido Healthcare",
  description: "Appointments for one doctor on a single day",
};

// Next 15+ hands searchParams to the page as a promise.
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DoctorPatientsRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  // Query params can repeat, so collapse any array down to the first value.
  const read = (key: string): string => {
    const value = sp[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Doctor Patients" />
      <DoctorPatientsPanel
        doctorId={read("doctor_id")}
        branchId={read("branch_id")}
        doctorName={read("name")}
        branchName={read("branch")}
        date={read("date")}
      />
    </div>
  );
}

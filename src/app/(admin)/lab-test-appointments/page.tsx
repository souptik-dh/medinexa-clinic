import LabTestAppointmentsPanel from "@/components/lab-tests/LabTestAppointmentsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Lab Test Appointments | MediNexa",
  description:
    "Manage lab test appointment lifecycle: approve, reject, complete, and collect payments",
};

export default function LabTestAppointmentsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Lab Test Appointments" />
      <LabTestAppointmentsPanel />
    </div>
  );
}

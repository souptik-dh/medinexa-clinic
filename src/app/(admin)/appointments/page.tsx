import AppointmentsPanel from "@/components/appointments/AppointmentsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Appointments | Jido Healthcare",
  description: "Manage appointment lifecycle: confirm, collect payment, complete, cancel",
};

export default function AppointmentsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Appointments" />
      <AppointmentsPanel />
    </div>
  );
}

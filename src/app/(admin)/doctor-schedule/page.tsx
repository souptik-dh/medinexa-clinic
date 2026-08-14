import DoctorMySchedulePanel from "@/components/doctors/DoctorMySchedulePanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "My Schedule | Jido Healthcare",
  description: "View and manage your own branch schedule",
};

export default function DoctorSchedulePage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="My Schedule" />
      <DoctorMySchedulePanel />
    </div>
  );
}

import ClinicLabSchedulePanel from "@/components/clinics/ClinicLabSchedulePanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Lab Schedules | Jido Healthcare",
  description: "Manage a clinic's branch lab schedules",
};

export default function ClinicLabSchedulePage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Lab Schedules"
        items={[{ label: "Clinics", href: "/clinics" }]}
      />
      <Suspense fallback={null}>
        <ClinicLabSchedulePanel />
      </Suspense>
    </div>
  );
}

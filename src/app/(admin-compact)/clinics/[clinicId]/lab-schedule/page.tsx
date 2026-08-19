import ClinicLabSchedulePanel from "@/components/clinics/ClinicLabSchedulePanel";
import { Metadata } from "next";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "Lab Schedules | Jido Healthcare",
  description: "Manage a clinic's branch lab schedules",
};

export default function ClinicLabSchedulePage() {
  return (
    <div>
      <Suspense fallback={null}>
        <ClinicLabSchedulePanel />
      </Suspense>
    </div>
  );
}

import StaffPanel from "@/components/staff/StaffPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Staff | Jido Healthcare",
  description: "Manage branch staff: invite members and control access",
};

// Part of the unified Clinics module — reachable from the Staff tab.
export default function ClinicStaffPage() {
  return (
    <div>
      <StaffPanel />
    </div>
  );
}

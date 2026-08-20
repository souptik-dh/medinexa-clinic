import AllAppointmentsPanel from "@/components/appointments/AllAppointmentsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "All Appointments | Jido Healthcare",
  description: "View and manage all doctor and lab test appointments for a clinic",
};

export default function AllAppointmentsPage() {
  return (
    <div>
      <AllAppointmentsPanel />
    </div>
  );
}

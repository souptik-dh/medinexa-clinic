import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AppointmentsCalendar from "@/components/calendar/AppointmentsCalendar";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Jido Healthcare | Calendar",
  description: "Calendar view of clinic appointments by month.",
};

export default function CalendarPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Calendar" />
      <AppointmentsCalendar />
    </div>
  );
}

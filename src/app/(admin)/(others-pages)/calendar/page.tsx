import Calendar from "@/components/calendar/CalendarLazy";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Jido Healthcare | Calendar",
  description:
    "A comprehensive calendar view for managing appointments, events, and schedules within the Jido Healthcare platform.",
  // other metadata
};
export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Calendar" />
      <Calendar />
    </div>
  );
}

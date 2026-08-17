import NotificationsPanel from "@/components/notifications/NotificationsPanel";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Notifications | Jido Healthcare",
  description: "View and manage your notifications",
};

export default function NotificationsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Notifications" />
      <NotificationsPanel />
    </div>
  );
}

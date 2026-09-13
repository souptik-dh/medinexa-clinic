import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SetPasswordCard from "@/components/settings/SetPasswordCard";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Settings | Jido Healthcare",
  description: "Account and application settings",
};

export default function SettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Settings" />
      <SetPasswordCard />
    </div>
  );
}

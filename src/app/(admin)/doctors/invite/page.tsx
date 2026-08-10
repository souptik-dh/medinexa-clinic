import InviteDoctorForm from "@/components/doctors/InviteDoctorForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Invite Doctor | MediBook",
  description: "Send a doctor invitation to join a branch",
};

export default function InviteDoctorPage() {
  return (
    <div>
      <PageBreadcrumb
        pageTitle="Invite Doctor"
        items={[{ label: "Doctors", href: "/doctors" }]}
      />
      <InviteDoctorForm />
    </div>
  );
}

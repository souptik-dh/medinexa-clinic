import { redirect } from "next/navigation";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clinic Overview | Jido Healthcare",
};

// Clinic editing now happens in a drawer on the overview tab.
export default async function EditClinicPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  redirect(`/clinics/${clinicId}/overview`);
}

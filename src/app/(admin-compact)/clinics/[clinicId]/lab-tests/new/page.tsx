import { redirect } from "next/navigation";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Lab Tests | Jido Healthcare",
};

// Lab test creation now happens in a drawer on the Lab Tests tab.
export default async function NewLabTestPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  redirect(`/clinics/${clinicId}/lab-tests`);
}

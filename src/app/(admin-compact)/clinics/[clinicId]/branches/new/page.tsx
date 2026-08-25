import { redirect } from "next/navigation";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Branches | Jido Healthcare",
};

// Branch creation now happens in a drawer on the Branches tab.
export default async function NewBranchPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  redirect(`/clinics/${clinicId}/branches`);
}

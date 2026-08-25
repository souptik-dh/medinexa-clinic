import { redirect } from "next/navigation";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Branches | Jido Healthcare",
};

// Branch editing now happens in a drawer on the Branches tab.
export default async function EditBranchPage({
  params,
}: {
  params: Promise<{ clinicId: string; branchId: string }>;
}) {
  const { clinicId, branchId } = await params;
  redirect(`/clinics/${clinicId}/branches/${branchId}/overview`);
}

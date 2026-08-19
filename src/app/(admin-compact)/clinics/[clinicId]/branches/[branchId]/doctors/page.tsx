import BranchDoctorsPanel from "@/components/branches/BranchDoctorsPanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Branch Doctors | Jido Healthcare",
  description: "View and manage doctors assigned to this branch",
};

export default function BranchDoctorsPage() {
  return (
    <div>
      <BranchDoctorsPanel />
    </div>
  );
}

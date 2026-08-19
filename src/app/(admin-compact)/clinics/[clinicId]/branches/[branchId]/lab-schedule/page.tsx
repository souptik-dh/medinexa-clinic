import BranchLabSchedulePanel from "@/components/lab-tests/BranchLabSchedulePanel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Lab Schedule | Jido Healthcare",
  description: "Manage a branch's weekly lab test schedule",
};

export default function BranchLabSchedulePage() {
  return (
    <div>
      <BranchLabSchedulePanel />
    </div>
  );
}

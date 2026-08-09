import type { Metadata } from "next";
import React from "react";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "MediBook Dashboard | Clinic Owner",
  description: "Dynamic clinic management dashboard powered by the MediBook API",
};

export default function Ecommerce() {
  return <Dashboard />;
}

import type { Metadata } from "next";
import React from "react";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Jido Healthcare - Jido Dashboard | Clinic Owner",
  description: "Dynamic clinic management dashboard powered by the Jido Healthcare API",
};

export default function Ecommerce() {
  return <Dashboard />;
}

"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

const TABS: {
  key: string;
  label: string;
  href: (clinicId: string, branchId: string) => string;
}[] = [
  {
    key: "overview",
    label: "Overview",
    href: (c, b) => `/clinics/${c}/branches/${b}/overview`,
  },
  {
    key: "doctors",
    label: "Doctors",
    href: (c, b) => `/clinics/${c}/branches/${b}/doctors`,
  },
  {
    key: "lab-tests",
    label: "Lab Tests",
    href: (c, b) => `/clinics/${c}/branches/${b}/lab-tests`,
  },
  {
    key: "lab-schedules",
    label: "Lab Schedules",
    href: (c, b) => `/clinics/${c}/branches/${b}/lab-schedule`,
  },
];

export default function BranchTabs() {
  const pathname = usePathname();
  const params = useParams<{
    clinicId?: string;
    branchId?: string;
  }>();
  const clinicId =
    typeof params.clinicId === "string" ? params.clinicId : "";
  const branchId =
    typeof params.branchId === "string" ? params.branchId : "";

  if (!clinicId || !branchId) return null;

  return (
    <div className="mb-6 flex gap-6 overflow-x-auto border-b border-gray-200 dark:border-gray-800 no-scrollbar">
      {TABS.map((tab) => {
        const href = tab.href(clinicId, branchId);
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.key}
            href={href}
            className={`-mb-px shrink-0 border-b-2 px-1 pb-3 text-sm font-medium transition ${
              active
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

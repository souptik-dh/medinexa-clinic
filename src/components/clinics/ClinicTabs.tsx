"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useParams, useSearchParams } from "next/navigation";

const TABS: { key: string; label: string; href: (clinicId: string) => string }[] = [
  { key: "overview", label: "Overview", href: (id) => `/clinics/${id}/overview` },
  { key: "branches", label: "Branches", href: (id) => `/clinics/${id}/branches` },
  { key: "doctors", label: "Doctors", href: (id) => `/clinics/${id}/doctors` },
  { key: "lab-tests", label: "Lab Tests", href: (id) => `/clinics/${id}/lab-tests` },
  { key: "lab-schedules", label: "Lab Schedules", href: (id) => `/clinics/${id}/lab-schedule` },
];

export default function ClinicTabs() {
  const pathname = usePathname();
  const params = useParams<{ clinicId?: string }>();
  const searchParams = useSearchParams();
  const routeClinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const clinicId = routeClinicId || searchParams.get("clinic_id") || "";

  if (!clinicId) return null;

  return (
    <div className="mb-6 flex gap-6 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
      {TABS.map((tab) => {
        const href = tab.href(clinicId);
        const active =
          pathname === href ||
          pathname.startsWith(`${href}/`);
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

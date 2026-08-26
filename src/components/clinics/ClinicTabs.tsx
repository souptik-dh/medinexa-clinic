"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useParams, useSearchParams } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

// Unified horizontal navigation for the whole Clinics module. Rendered once
// by the compact layout for every /clinics/{clinicId}/... page so the section
// feels like a single application with tabs, not disconnected pages. Falls
// back to the ?clinic_id= query param for the standalone /doctors and
// /lab-tests pages that reuse this bar outside the clinics routes.
const TABS: { key: string; labelKey: string; href: (clinicId: string) => string }[] = [
  { key: "overview", labelKey: "clinicsPage.overview", href: (id) => `/clinics/${id}/overview` },
  { key: "branches", labelKey: "clinicsPage.branches", href: (id) => `/clinics/${id}/branches` },
  { key: "doctors", labelKey: "clinicsPage.doctors", href: (id) => `/clinics/${id}/doctors` },
  // { key: "staff", labelKey: "clinicsPage.staff", href: (id) => `/clinics/${id}/staff` },
  // { key: "appointments", labelKey: "appointments.title", href: (id) => `/clinics/${id}/all-appointments` },
  { key: "lab-tests", labelKey: "clinicsPage.labTests", href: (id) => `/clinics/${id}/lab-tests` },
  { key: "lab-schedules", labelKey: "clinicsPage.labSchedule", href: (id) => `/clinics/${id}/lab-schedule` },
  // { key: "patients", labelKey: "clinicsPage.patients", href: (id) => `/clinics/${id}/patients` },
  // { key: "billing", labelKey: "clinicsPage.billing", href: (id) => `/clinics/${id}/billing` },
];

export default function ClinicTabs() {
  const pathname = usePathname();
  const params = useParams<{ clinicId?: string }>();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const routeClinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const clinicId = routeClinicId || searchParams.get("clinic_id") || "";

  if (!clinicId) return null;

  return (
    <nav
      aria-label="Clinic sections"
      className="mb-6 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100/70 p-1 dark:border-gray-800 dark:bg-white/[0.03] no-scrollbar"
    >
      <div className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = tab.href(clinicId);
          // A tab is active when on it or any of its nested sub-pages
          // (e.g. a branch's overview keeps "Branches" highlighted).
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (tab.key === "overview" && pathname === `/clinics/${clinicId}`);
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                active
                  ? "bg-white text-brand-500 shadow-sm dark:bg-gray-900"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

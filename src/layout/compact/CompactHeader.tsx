"use client";

import React from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import UserDropdown from "@/components/header/UserDropdown";

interface BackTarget {
  label: string;
  href: string;
}

function useBackTarget(): BackTarget {
  const pathname = usePathname();
  const params = useParams<{
    clinicId?: string;
    branchId?: string;
    doctorId?: string;
    id?: string;
  }>();

  const clinicId = params.clinicId ?? "";
  const branchId = params.branchId ?? "";

  //诊所 sub-pages
  if (pathname === "/clinics/new") {
    return { label: "Clinics", href: "/clinics" };
  }
  if (pathname.endsWith("/edit") && pathname.includes("/clinics/") && !pathname.includes("/branches/")) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.endsWith("/overview") && pathname.match(/\/clinics\/[^/]+\/overview\/?$/)) {
    // The clinic-list page is skipped, so from an overview the only way "back"
    // is the dashboard.
    return { label: "Dashboard", href: "/dashboard" };
  }
  if (pathname.match(/\/clinics\/[^/]+\/(staff|patients|billing)\/?$/)) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/branches\/?$/) && !pathname.includes("/branches/new")) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/doctors\/?$/)) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/lab-tests\/?$/) && !pathname.includes("/lab-tests/new")) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/lab-schedule\/?$/)) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/all-appointments\/?$/)) {
    return { label: "Clinic Overview", href: `/clinics/${clinicId}/overview` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/lab-tests\/new\/?$/)) {
    return { label: "Lab Tests", href: `/clinics/${clinicId}/lab-tests` };
  }
  if (pathname.match(/\/clinics\/[^/]+\/lab-tests\/[^/]+\/edit\/?$/)) {
    return { label: "Lab Tests", href: `/clinics/${clinicId}/lab-tests` };
  }

  // Branch sub-pages
  if (pathname.match(/\/branches\/new\/?$/)) {
    return { label: "Branches", href: `/clinics/${clinicId}/branches` };
  }
  if (pathname.endsWith("/overview") && pathname.includes("/branches/") && !pathname.endsWith("/branches/")) {
    return { label: "Branches", href: `/clinics/${clinicId}/branches` };
  }
  if (pathname.endsWith("/edit") && pathname.includes("/branches/")) {
    return { label: "Branch Overview", href: `/clinics/${clinicId}/branches/${branchId}/overview` };
  }
  if (pathname.match(/\/branches\/[^/]+\/doctors\/?$/)) {
    return { label: "Branch Overview", href: `/clinics/${clinicId}/branches/${branchId}/overview` };
  }
  if (pathname.match(/\/branches\/[^/]+\/lab-tests\/?$/)) {
    return { label: "Branch Overview", href: `/clinics/${clinicId}/branches/${branchId}/overview` };
  }
  if (pathname.match(/\/branches\/[^/]+\/lab-tests\/new\/?$/)) {
    return { label: "Lab Tests", href: `/clinics/${clinicId}/branches/${branchId}/lab-tests` };
  }
  if (pathname.match(/\/branches\/[^/]+\/lab-tests\/[^/]+\/edit\/?$/)) {
    return { label: "Lab Tests", href: `/clinics/${clinicId}/branches/${branchId}/lab-tests` };
  }
  if (pathname.match(/\/branches\/[^/]+\/schedule\/?$/)) {
    return { label: "Branch Overview", href: `/clinics/${clinicId}/branches/${branchId}/overview` };
  }
  if (pathname.match(/\/branches\/[^/]+\/lab-schedule\/?$/)) {
    return { label: "Branch Overview", href: `/clinics/${clinicId}/branches/${branchId}/overview` };
  }

  // Doctor sub-pages
  if (pathname === "/doctors/invite") {
    return { label: "Doctors", href: "/doctors" };
  }
  if (pathname.match(/\/doctors\/[^/]+\/[^/]+\/edit\/?$/)) {
    return { label: "Doctor Profile", href: `/doctors/${params.branchId}/${params.doctorId}` };
  }
  if (pathname.match(/\/doctors\/[^/]+\/[^/]+\/?$/)) {
    return { label: "Doctors", href: "/doctors" };
  }

  // Staff sub-pages
  if (pathname.match(/\/staff\/[^/]+\/[^/]+\/permissions\/?$/)) {
    return { label: "Staff", href: "/staff" };
  }

  // Lab test appointment sub-pages
  if (pathname.match(/\/lab-test-appointments\/[^/]+\/?$/)) {
    return { label: "Lab Test Appointments", href: "/lab-test-appointments" };
  }
  if (pathname.match(/\/lab-test-appointments\/[^/]+\/(approve|reject|cancel|collect-payment)\/?$/)) {
    return { label: "Appointment Details", href: `/lab-test-appointments/${params.id}` };
  }

  // Fallback
  return { label: "Dashboard", href: "/dashboard" };
}

function getPageTitle(pathname: string): string {
  if (pathname === "/clinics/new") return "Add New Clinic";
  if (pathname.endsWith("/edit") && pathname.includes("/clinics/") && !pathname.includes("/branches/")) return "Edit Clinic";
  if (pathname.endsWith("/overview") && pathname.match(/\/clinics\/[^/]+\/overview\/?$/)) return "Clinic Overview";
  if (pathname.match(/\/clinics\/[^/]+\/staff\/?$/)) return "Clinic Staff";
  if (pathname.match(/\/clinics\/[^/]+\/patients\/?$/)) return "Clinic Patients";
  if (pathname.match(/\/clinics\/[^/]+\/billing\/?$/)) return "Subscription & Billing";
  if (pathname.match(/\/clinics\/[^/]+\/branches\/?$/) && !pathname.includes("/branches/new")) return "Branches";
  if (pathname.match(/\/clinics\/[^/]+\/doctors\/?$/)) return "Clinic Doctors";
  if (pathname.match(/\/clinics\/[^/]+\/lab-tests\/?$/) && !pathname.includes("/lab-tests/new")) return "Lab Tests";
  if (pathname.match(/\/clinics\/[^/]+\/lab-schedule\/?$/)) return "Lab Schedules";
  if (pathname.match(/\/clinics\/[^/]+\/all-appointments\/?$/)) return "All Appointments";
  if (pathname.match(/\/clinics\/[^/]+\/lab-tests\/new\/?$/)) return "Add Lab Test";
  if (pathname.match(/\/clinics\/[^/]+\/lab-tests\/[^/]+\/edit\/?$/)) return "Edit Lab Test";

  if (pathname.match(/\/branches\/new\/?$/)) return "Add New Branch";
  if (pathname.endsWith("/overview") && pathname.includes("/branches/")) return "Branch Overview";
  if (pathname.endsWith("/edit") && pathname.includes("/branches/")) return "Edit Branch";
  if (pathname.match(/\/branches\/[^/]+\/doctors\/?$/)) return "Branch Doctors";
  if (pathname.match(/\/branches\/[^/]+\/lab-tests\/new\/?$/)) return "Configure Lab Test";
  if (pathname.match(/\/branches\/[^/]+\/lab-tests\/[^/]+\/edit\/?$/)) return "Edit Lab Test";
  if (pathname.match(/\/branches\/[^/]+\/schedule\/?$/)) return "Operating Schedule";
  if (pathname.match(/\/branches\/[^/]+\/lab-schedule\/?$/)) return "Lab Schedule";

  if (pathname === "/doctors/invite") return "Invite Doctor";
  if (pathname.match(/\/doctors\/[^/]+\/[^/]+\/edit\/?$/)) return "Edit Doctor";
  if (pathname.match(/\/doctors\/[^/]+\/[^/]+\/?$/)) return "Doctor Profile";

  if (pathname.match(/\/staff\/[^/]+\/[^/]+\/permissions\/?$/)) return "Staff Permissions";

  if (pathname.match(/\/lab-test-appointments\/[^/]+\/approve\/?$/)) return "Approve Appointment";
  if (pathname.match(/\/lab-test-appointments\/[^/]+\/reject\/?$/)) return "Reject Appointment";
  if (pathname.match(/\/lab-test-appointments\/[^/]+\/cancel\/?$/)) return "Cancel Appointment";
  if (pathname.match(/\/lab-test-appointments\/[^/]+\/collect-payment\/?$/)) return "Collect Payment";
  if (pathname.match(/\/lab-test-appointments\/[^/]+\/?$/)) return "Appointment Details";

  return "Page";
}

export default function CompactHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const back = useBackTarget();
  const title = getPageTitle(pathname);

  const handleBack = () => {
    const stored = sessionStorage.getItem("compact-back-url");
    if (stored) {
      sessionStorage.removeItem("compact-back-url");
      router.push(stored);
      return;
    }
    // Prefer real browser back navigation so the user lands on whatever page
    // they actually came from; the computed `back.href` is only a fallback
    // for a direct/refreshed page load where there's no in-app history.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(back.href);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:h-16 md:px-6">
        {/* Left: Back button + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleBack}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            <span className="hidden sm:inline">Back to {back.label}</span>
            <span className="sm:hidden">Back</span>
          </button>
          <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
          <h1 className="truncate text-sm font-semibold text-gray-800 dark:text-white/90 md:text-base">
            {title}
          </h1>
        </div>

        {/* Right: Theme toggle + User dropdown */}
        <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <UserDropdown />
        </div>
      </div>
    </header>
  );
}

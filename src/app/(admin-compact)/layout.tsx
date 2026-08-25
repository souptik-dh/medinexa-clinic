"use client";

import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import SubscriptionGateBanner from "@/components/subscription/SubscriptionGateBanner";
import SubscriptionTrialBanner from "@/components/subscription/SubscriptionTrialBanner";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import { useRouter } from "next/navigation";
import React, { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AdminCompactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { user, isAuthReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isAuthReady && !user) {
      router.replace("/signin");
    }
  }, [isAuthReady, user, router]);

  if (!user) {
    return null;
  }

  // Dynamic class for main content margin based on sidebar state
  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  // Every /clinics/{clinicId}/... page shares the same horizontal tab bar so
  // the whole section reads as one unified Clinics module.
  const inClinicModule = /^\/clinics\/[^/]+(\/|$)/.test(pathname);

  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar and Backdrop */}
      <AppSidebar />
      <Backdrop />
      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* Header */}
        <AppHeader />
        <SubscriptionGateBanner />
        {/* Page Content */}
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <SubscriptionTrialBanner />
          {inClinicModule ? (
            <Suspense fallback={null}>
              <ClinicTabs />
            </Suspense>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}

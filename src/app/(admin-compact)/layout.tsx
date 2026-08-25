"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import React, { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import CompactHeader from "@/layout/compact/CompactHeader";
import ClinicTabs from "@/components/clinics/ClinicTabs";

export default function AdminCompactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Every /clinics/{clinicId}/... page shares the same horizontal tab bar so
  // the whole section reads as one unified Clinics module.
  const inClinicModule = /^\/clinics\/[^/]+(\/|$)/.test(pathname);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <CompactHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {inClinicModule ? (
          <Suspense fallback={null}>
            <ClinicTabs />
          </Suspense>
        ) : null}
        {children}
      </main>
    </div>
  );
}

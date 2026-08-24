"use client";

import { useAuth } from "@/context/AuthContext";
import React from "react";

// Route-level guard: only sys_admin users can reach anything under
// /super-admin. The API enforces this server-side as well; this just keeps
// non-admins out of the UI.
export default function SuperAdminGuardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthReady } = useAuth();

  if (!isAuthReady) {
    return null;
  }

  if (user?.role !== "sys_admin") {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
        You do not have permission to view this area. Super admin access is
        required.
      </div>
    );
  }

  return <>{children}</>;
}

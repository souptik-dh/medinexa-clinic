"use client";
import React from "react";
import { SWRConfig } from "swr";

/**
 * Cross-navigation cache for the admin dashboard's client-fetched data.
 * revalidateOnFocus/revalidateIfStale are off since the backend has rate
 * limits on some endpoints (e.g. doctor search) - refetch on remount/interval
 * only, not on every tab focus.
 */
export default function AppSWRConfig({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 10_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}

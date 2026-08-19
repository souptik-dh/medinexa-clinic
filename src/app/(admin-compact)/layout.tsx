"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import CompactHeader from "@/layout/compact/CompactHeader";

export default function AdminCompactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthReady && !user) {
      router.replace("/signin");
    }
  }, [isAuthReady, user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <CompactHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}

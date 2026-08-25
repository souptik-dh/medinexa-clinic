"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { ApiError, clinicsApi } from "@/lib/api";

// /clinics used to be the clinic-list page. Owners now land directly on their
// clinic's overview section instead — this panel resolves which clinic that is
// (authoritative fresh list first, cached login clinic as fallback) and
// redirects there. Shown only transiently, or as an empty state when the
// account has no clinic yet (e.g. right after deleting one).
export default function ClinicsRedirect() {
  const router = useRouter();
  const { user, clinic, isAuthReady } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [noClinics, setNoClinics] = useState(false);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      router.replace("/signin");
      return;
    }
    if (user.role !== "clinic_owner" && user.role !== "sys_admin") {
      router.replace("/dashboard");
      return;
    }
    let active = true;
    // The API list is authoritative — the cached login clinic can be stale
    // (e.g. the clinic was just deleted).
    clinicsApi
      .list({ limit: 1 })
      .then((res) => {
        if (!active) return;
        const first = res.items[0];
        if (first) {
          router.replace(`/clinics/${first.id}/overview`);
        } else {
          setNoClinics(true);
        }
      })
      .catch((err) => {
        if (!active) return;
        // Offline/API failure — fall back to the cached login clinic.
        if (clinic?.id) {
          router.replace(`/clinics/${clinic.id}/overview`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load your clinics.");
      });
    return () => {
      active = false;
    };
  }, [isAuthReady, user, clinic, router]);

  if (error) {
    return (
      <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
        {error}
      </div>
    );
  }

  if (noClinics) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          No clinic yet
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Your account doesn&apos;t have a clinic. Create one to start managing
          branches, doctors, and appointments.
        </p>
        <Link
          href="/clinics/new"
          className="mt-5 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Create clinic
        </Link>
      </div>
    );
  }

  return <DetailSkeleton rows={3} />;
}

"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import { Branch, branchesApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

// Lab Schedule is inherently branch-scoped (a weekly schedule belongs to one
// branch's staff/rooms), so there's no single clinic-wide page for it. A
// single-branch clinic has nothing to pick, so it goes straight to that
// branch's schedule; a multi-branch clinic gets a picker instead.
export default function ClinicLabSchedulePanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const router = useRouter();

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    branchesApi
      .list(clinicId)
      .then((res) => {
        setBranches(res.items);
        if (res.items.length === 1) {
          router.replace(`/clinics/${clinicId}/branches/${res.items[0].id}/lab-schedule`);
        }
      })
      .catch((err) => setError(getErrorMessage(err, "Failed to load branches")));
  }, [clinicId, router]);

  const loading = branches === null && !error;
  const showPicker = branches !== null && branches.length !== 1;

  return (
    <div className="space-y-6">
      <ClinicTabs />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Lab Schedules</h3>
        {error ? (
          <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : !showPicker ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Redirecting…</p>
        ) : branches!.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No branches yet — create one before setting up a lab schedule.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {branches!.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/clinics/${clinicId}/branches/${b.id}/lab-schedule`}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <span className="font-medium text-gray-800 dark:text-white/90">{b.name}</span>
                  <span className="text-sm font-medium text-brand-500">View schedule →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

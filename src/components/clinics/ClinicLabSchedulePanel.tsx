"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import { Branch, branchesApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import TruckLoader from "@/components/common/TruckLoader";

export default function ClinicLabSchedulePanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const router = useRouter();

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");

  useEffect(() => {
    if (!clinicId) return;
    branchesApi
      .list(clinicId)
      .then((res) => {
        setBranches(res.items);
        if (res.items.length === 1) {
          router.replace(
            `/clinics/${clinicId}/branches/${res.items[0].id}/lab-schedule`
          );
        } else if (res.items.length > 0) {
          setSelectedBranch(res.items[0].id);
        }
      })
      .catch((err) =>
        setError(getErrorMessage(err, "Failed to load branches"))
      );
  }, [clinicId, router]);

  const loading = branches === null && !error;
  const showPicker = branches !== null && branches.length > 1;

  return (
    <div className="space-y-6">
      <ClinicTabs />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Lab Schedules
          </h3>
          {showPicker && selectedBranch && (
            <Link
              href={`/clinics/${clinicId}/branches/${selectedBranch}/lab-schedule`}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              View Schedule →
            </Link>
          )}
        </div>

        {error ? (
          <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        ) : loading ? (
          <TruckLoader label="Loading schedule…" />
        ) : !showPicker ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Redirecting…
          </p>
        ) : (
          <>
            {/* Branch Selector */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Branch
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-11 w-full max-w-xs rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {branches!.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Schedule List */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {branches!.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/clinics/${clinicId}/branches/${b.id}/lab-schedule`}
                    className="-mx-2 flex items-center justify-between rounded-lg px-2 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {b.name}
                    </span>
                    <span className="text-sm font-medium text-brand-500">
                      View schedule →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

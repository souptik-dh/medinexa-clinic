"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import RatingStars from "@/components/common/RatingStars";
import {
  Branch,
  branchLabTestsApi,
  branchesApi,
  doctorsApi,
  labTestSchedulesApi,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function BranchOverviewPanel() {
  const params = useParams<{ clinicId?: string; branchId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const branchId = typeof params.branchId === "string" ? params.branchId : "";

  const [branch, setBranch] = useState<Branch | null>(null);
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [labTestCount, setLabTestCount] = useState<number | null>(null);
  const [scheduleCount, setScheduleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId || !branchId) return;
    setLoading(true);
    setError(null);
    try {
      const [branchesRes, doctorsRes, labTestsRes, scheduleRes] = await Promise.all([
        branchesApi.list(clinicId),
        doctorsApi.listByBranch(branchId),
        branchLabTestsApi.list(branchId),
        labTestSchedulesApi.list(branchId),
      ]);
      const found = branchesRes.items.find((b) => b.id === branchId) ?? null;
      if (!found) {
        setError("Branch not found.");
        return;
      }
      setBranch(found);
      setDoctorCount(doctorsRes.total);
      setLabTestCount(labTestsRes.items.length);
      setScheduleCount(scheduleRes.items.length);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load branch overview"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  }
  if (error || !branch) {
    return (
      <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
        {error ?? "Branch not found."}
      </div>
    );
  }

  const addressLine = [branch.city, branch.district, branch.state, branch.pin_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{branch.name}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {branch.phone} · {branch.timezone}
            </p>
            {addressLine && (
              <p className="mt-2 text-theme-xs text-gray-400 dark:text-gray-500">{addressLine}</p>
            )}
            <div className="mt-2">
              <RatingStars average={branch.rating?.average ?? null} count={branch.rating?.count ?? 0} size="sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clinics/${clinicId}/branches/${branchId}/edit`}
              className="rounded-lg border border-brand-500/40 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              Edit branch
            </Link>
            <Link href="/branches" className="text-sm font-medium text-brand-500 hover:underline">
              View all branches
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge color={branch.trade_license_validated ? "success" : "warning"}>
            Trade license {branch.trade_license_validated ? "validated" : "pending"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Doctors" value={doctorCount ?? "—"} />
        <StatCard label="Lab Tests configured" value={labTestCount ?? "—"} />
        <StatCard label="Lab schedule entries" value={scheduleCount ?? "—"} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Manage</h3>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/doctors?clinic_id=${clinicId}&branch_id=${branchId}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Doctors
          </Link>
          <Link
            href={`/clinics/${clinicId}/branches/${branchId}/lab-tests`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Lab Tests
          </Link>
          <Link
            href={`/clinics/${clinicId}/branches/${branchId}/lab-schedule`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Lab Schedule
          </Link>
          <Link
            href={`/clinics/${clinicId}/branches/${branchId}/schedule`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Operating Hours
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">{value}</h4>
    </div>
  );
}

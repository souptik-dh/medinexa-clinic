"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import { Clinic, branchesApi, clinicsApi, doctorsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useAuth } from "@/context/AuthContext";
import { canCreateClinic } from "@/lib/permissions";

type ClinicRow = Clinic & { doctorCount: number | null };

export default function ClinicsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canCreate = isAdmin || canCreateClinic(user?.role === "branch_staff" ? user.permissions : undefined);

  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.list({ limit: 50 });
      setClinics(res.items.map((c) => ({ ...c, doctorCount: null })));

      // Doctor counts have no clinic-level aggregate endpoint, so fill each
      // row in independently (branches -> per-branch doctor count) rather
      // than blocking the whole list on every clinic's fan-out.
      res.items.forEach((clinic) => {
        branchesApi
          .list(clinic.id)
          .then((branchesRes) =>
            Promise.all(
              branchesRes.items.map((b) =>
                doctorsApi
                  .listByBranch(b.id)
                  .then((r) => r.total)
                  .catch(() => 0)
              )
            )
          )
          .then((counts) => {
            const total = counts.reduce((sum, n) => sum + n, 0);
            setClinics((prev) =>
              prev.map((row) => (row.id === clinic.id ? { ...row, doctorCount: total } : row))
            );
          })
          .catch(() => {
            setClinics((prev) =>
              prev.map((row) => (row.id === clinic.id ? { ...row, doctorCount: 0 } : row))
            );
          });
      });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load clinics"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Only clinic owners can view the clinic directory.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Clinics</h3>
        {canCreate && (
          <Link
            href="/clinics/new"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            + Add Clinic
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : clinics.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No clinics yet. Create your first clinic.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {clinics.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clinics/${c.id}/overview`}
                className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 dark:text-white/90">{c.name}</p>
                  <p className="mt-1 text-theme-xs text-gray-400 dark:text-gray-500">
                    Created {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge color="info">
                    {c.branch_count ?? 0} {c.branch_count === 1 ? "Branch" : "Branches"}
                  </Badge>
                  <Badge color="light">
                    {c.doctorCount === null ? "…" : c.doctorCount} Doctors
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

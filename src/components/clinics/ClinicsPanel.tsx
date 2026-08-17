"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import ClinicLicensesPanel from "@/components/clinics/ClinicLicensesPanel";
import { ApiError, Clinic, clinicsApi } from "@/lib/api";
import { formatDate, formatFullAddress } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { canCreateClinic, canDeleteClinic, canUpdateClinic } from "@/lib/permissions";

export default function ClinicsPanel() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selected, setSelected] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canCreate = isAdmin || canCreateClinic(userPermissions);
  const canDelete = isAdmin || canDeleteClinic(userPermissions);
  const canUpdate = isAdmin || canUpdateClinic(userPermissions);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.list({ limit: 50 });
      setClinics(res.items);
      setSelected((prev) => prev ?? res.items[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load clinics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (selected && !selected.trade_license_url) {
      toast("Trade license: No document uploaded.", { icon: "⚠️" });
    }
  }, [selected]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Only clinic owners can view the clinic directory.
      </div>
    );
  }

  const removeClinic = async (clinic: Clinic) => {
    if (!window.confirm(`Delete clinic "${clinic.name}"? Active appointments must be handled first.`)) return;
    setBusy(true);
    setError(null);
    try {
      await clinicsApi.remove(clinic.id, true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Clinics list */}
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Clinics
            </h3>
            {canCreate && (
              <Link
                href="/clinics/new"
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                + New clinic
              </Link>
            )}
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : clinics.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No clinics yet. Create your first clinic.
            </p>
          ) : (
            <ul className="space-y-2">
              {clinics.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected?.id === c.id
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800 dark:text-white/90">
                        {c.name}
                      </span>
                      <Badge color="info">{c.branch_count ?? 0} branches</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                      {c.description ?? "No description"}
                    </p>
                    <p className="mt-2 text-theme-xs text-gray-400 dark:text-gray-500">
                      Created {formatDate(c.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Clinic details */}
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Clinic details
              {selected && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  — {selected.name}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {canUpdate && selected && (
                <Link
                  href={`/clinics/${selected.id}/edit`}
                  className="rounded-lg border border-brand-500/40 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                >
                  Edit clinic
                </Link>
              )}
              {canDelete && (
                <button
                  onClick={() => selected && removeClinic(selected)}
                  disabled={busy || !selected}
                  className="rounded-lg border border-error-500/40 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                >
                  Delete clinic
                </button>
              )}
            </div>
          </div>
          {!selected ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a clinic to view its details.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-gray-600 dark:text-gray-300">
                {selected.description ?? "No description"}
              </p>
              <p className="whitespace-pre-line text-gray-500 dark:text-gray-400">
                {formatFullAddress(selected)}
              </p>
              <p className="text-theme-xs text-gray-400 dark:text-gray-500">
                Created {formatDate(selected.created_at)}
              </p>
            </div>
          )}
        </div>
      </div>

      {selected && !selected.trade_license_url && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <p className="font-medium text-gray-800 dark:text-white/90">
            Trade license <span className="text-error-500">*</span>
          </p>
          <p className="mt-1 text-sm text-warning-600 dark:text-orange-400">
            ⚠ No document uploaded.
          </p>
        </div>
      )}

      {/* Clinic licenses */}
      {selected && (
        <div className="mt-6">
          <ClinicLicensesPanel clinicId={selected.id} clinicName={selected.name} />
        </div>
      )}
    </div>
  );
}

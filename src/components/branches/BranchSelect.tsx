"use client";
import React, { useEffect, useRef, useState } from "react";
import { ApiError, Branch, branchesApi, clinicsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";

export interface BranchSelectValue {
  id: string;
  name: string;
  clinic_id: string;
}

interface BranchSelectProps {
  value: string;
  onChange: (branch: BranchSelectValue | null) => void;
  onBlur?: () => void;
  disabled?: boolean;
  error?: boolean;
  hint?: string;
  // Pre-select a clinic (and, once its branches load, a branch) instead of
  // defaulting to the owner's first one — used for deep links from the
  // Clinics sidebar tree into a specific clinic/branch.
  initialClinicId?: string;
  initialBranchId?: string;
}

const selectClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50";

const selectErrorClass =
  "h-11 w-full rounded-lg border border-error-500 bg-transparent px-3 text-sm text-gray-800 focus:border-error-500 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 dark:border-error-500 dark:bg-gray-900 dark:text-error-400 disabled:opacity-50";

export default function BranchSelect({
  value,
  onChange,
  onBlur,
  disabled,
  error,
  hint,
  initialClinicId,
  initialBranchId,
}: BranchSelectProps) {
  const { user, staffClinic, staffBranch } = useAuth();
  const { t } = useTranslation();

  if (user?.role === "branch_staff") {
    return (
      <StaffBranchLock
        clinic={staffClinic}
        branch={staffBranch}
        onChange={onChange}
      />
    );
  }

  return (
    <OwnerBranchPicker
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      error={error}
      hint={hint}
      initialClinicId={initialClinicId}
      initialBranchId={initialBranchId}
    />
  );
}

// Branch staff are scoped to a single branch server-side (GET
// /branch-staff/me), so there's nothing to pick - just report it and lock
// the UI to it, instead of exposing the full clinic/branch directory that
// OwnerBranchPicker below fetches for clinic owners.
function StaffBranchLock({
  clinic,
  branch,
  onChange,
}: {
  clinic: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  onChange: (branch: BranchSelectValue | null) => void;
}) {
  const { t } = useTranslation();
  const reported = useRef<string | null>(null);
  useEffect(() => {
    const id = branch?.id ?? null;
    if (reported.current === id) return;
    reported.current = id;
    onChange(branch ? { id: branch.id, name: branch.name, clinic_id: clinic?.id ?? "" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id, clinic?.id]);

  if (!branch) {
    return (
      <p className="text-sm text-error-600 dark:text-error-400">
        {t("branches.couldNotLoadAssignedBranch")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-56">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {t("billing.clinic")}
        </label>
        <p className="flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90">
          {clinic?.name ?? "—"}
        </p>
      </div>
      <div className="sm:w-56">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {t("appointments.branch")}
        </label>
        <p className="flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90">
          {branch.name}
        </p>
      </div>
    </div>
  );
}

function OwnerBranchPicker({
  value,
  onChange,
  onBlur,
  disabled,
  error: hasRequiredError,
  hint,
  initialClinicId,
  initialBranchId,
}: BranchSelectProps) {
  const { t } = useTranslation();
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only honor the deep-linked branch on its first resolution — later clinic
  // switches (by the user, or a re-render) should fall back to "first branch".
  const pendingInitialBranchId = useRef(initialBranchId);

  useEffect(() => {
    let active = true;
    clinicsApi
      .list({ limit: 100 })
      .then((res) => {
        if (!active) return;
        setClinics(res.items);
        if (res.items.length > 0) {
          const preferred =
            initialClinicId && res.items.some((c) => c.id === initialClinicId)
              ? initialClinicId
              : res.items[0].id;
          setClinicId(preferred);
          setLoadingBranches(true);
        }
      })
      .catch((err) => {
        if (active)
          setLoadError(err instanceof ApiError ? err.message : t("billing.failedToLoadClinics"));
      })
      .finally(() => {
        if (active) setLoadingClinics(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clinicId) return;
    let active = true;
    branchesApi
      .list(clinicId)
      .then((res) => {
        if (!active) return;
        setBranches(res.items);
        if (!value && res.items.length > 0) {
          const pendingId = pendingInitialBranchId.current;
          pendingInitialBranchId.current = undefined;
          const preferred = pendingId ? res.items.find((b) => b.id === pendingId) : undefined;
          onChange(preferred ?? res.items[0]);
        }
      })
      .catch(() => {
        if (active) {
          setBranches([]);
          setLoadError(t("branches.failedToLoad"));
        }
      })
      .finally(() => {
        if (active) setLoadingBranches(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const onClinicChange = (id: string) => {
    setClinicId(id);
    setLoadingBranches(true);
    setBranches([]);
    setLoadError(null);
    onChange(null);
  };

  return (
    <div>
      {loadError && (
        <p className="mb-3 text-sm text-error-600 dark:text-error-400">{loadError}</p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-56">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("billing.clinic")}
          </label>
          <select
            value={clinicId}
            onChange={(e) => onClinicChange(e.target.value)}
            disabled={disabled}
            className={selectClass}
          >
            <option value="">
              {loadingClinics ? t("branches.loadingClinics") : t("billing.selectClinic")}
            </option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-56">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("appointments.branch")}
          </label>
          <select
            value={value}
            onChange={(e) => {
              const branch = branches.find((b) => b.id === e.target.value) ?? null;
              onChange(branch);
            }}
            onBlur={onBlur}
            disabled={disabled || !clinicId}
            className={hasRequiredError ? selectErrorClass : selectClass}
          >
            <option value="">
              {!clinicId
                ? t("branches.selectClinicFirst")
                : loadingBranches
                  ? t("branches.loadingBranchesEllipsis")
                  : t("branches.selectBranch")}
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {hint && (
            <p
              className={`mt-1.5 text-xs ${
                hasRequiredError ? "text-error-500" : "text-gray-500"
              }`}
            >
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

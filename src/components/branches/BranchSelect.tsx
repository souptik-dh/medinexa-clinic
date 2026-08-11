"use client";
import React, { useEffect, useRef, useState } from "react";
import { ApiError, Branch, branchesApi, clinicsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export interface BranchSelectValue {
  id: string;
  name: string;
}

interface BranchSelectProps {
  value: string;
  onChange: (branch: BranchSelectValue | null) => void;
  disabled?: boolean;
}

const selectClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50";

export default function BranchSelect({
  value,
  onChange,
  disabled,
}: BranchSelectProps) {
  const { user, staffClinic, staffBranch } = useAuth();

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
    <OwnerBranchPicker value={value} onChange={onChange} disabled={disabled} />
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
  branch: BranchSelectValue | null;
  onChange: (branch: BranchSelectValue | null) => void;
}) {
  const reported = useRef<string | null>(null);
  useEffect(() => {
    const id = branch?.id ?? null;
    if (reported.current === id) return;
    reported.current = id;
    onChange(branch ? { id: branch.id, name: branch.name } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id]);

  if (!branch) {
    return (
      <p className="text-sm text-error-600 dark:text-error-400">
        Could not load your assigned branch. Try refreshing, or contact your
        clinic owner if this persists.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-56">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Clinic
        </label>
        <p className="flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90">
          {clinic?.name ?? "—"}
        </p>
      </div>
      <div className="sm:w-56">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Branch
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
  disabled,
}: BranchSelectProps) {
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    clinicsApi
      .list({ limit: 100 })
      .then((res) => {
        if (!active) return;
        setClinics(res.items);
        if (res.items.length > 0) {
          setClinicId(res.items[0].id);
          setLoadingBranches(true);
        }
      })
      .catch((err) => {
        if (active)
          setError(err instanceof ApiError ? err.message : "Failed to load clinics");
      })
      .finally(() => {
        if (active) setLoadingClinics(false);
      });
    return () => {
      active = false;
    };
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
          onChange(res.items[0]);
        }
      })
      .catch(() => {
        if (active) {
          setBranches([]);
          setError("Failed to load branches");
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
    onChange(null);
  };

  return (
    <div>
      {error && (
        <p className="mb-3 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-56">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Clinic
          </label>
          <select
            value={clinicId}
            onChange={(e) => onClinicChange(e.target.value)}
            disabled={disabled}
            className={selectClass}
          >
            <option value="">
              {loadingClinics ? "Loading clinics…" : "Select clinic"}
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
            Branch
          </label>
          <select
            value={value}
            onChange={(e) => {
              const branch = branches.find((b) => b.id === e.target.value) ?? null;
              onChange(branch);
            }}
            disabled={disabled || !clinicId}
            className={selectClass}
          >
            <option value="">
              {!clinicId
                ? "Select a clinic first"
                : loadingBranches
                  ? "Loading branches…"
                  : "Select branch"}
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

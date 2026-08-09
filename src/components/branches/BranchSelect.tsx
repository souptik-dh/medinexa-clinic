"use client";
import React, { useEffect, useState } from "react";
import { ApiError, Branch, branchesApi, clinicsApi } from "@/lib/api";

interface BranchSelectProps {
  value: string;
  onChange: (branch: Branch | null) => void;
  disabled?: boolean;
}

const selectClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50";

export default function BranchSelect({
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
        if (active) setClinics(res.items);
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
        if (active) setBranches(res.items);
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

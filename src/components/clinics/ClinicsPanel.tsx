"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import ClinicLicensesPanel from "@/components/clinics/ClinicLicensesPanel";
import ConfirmDeleteModal from "@/components/common/ConfirmDeleteModal";
import { Branch, Clinic, ClinicLicenseType, branchesApi, clinicsApi } from "@/lib/api";
import { formatDate, formatFullAddress } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useAuth } from "@/context/AuthContext";
import {
  canCreateBranch,
  canCreateClinic,
  canDeleteClinic,
  canUpdateClinic,
} from "@/lib/permissions";
import {
  autoCreateBranchForClinic,
  clearAutoBranchPending,
  isAutoBranchPending,
} from "@/lib/autoCreateBranch";

export default function ClinicsPanel() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Clinic | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clinicToDelete, setClinicToDelete] = useState<Clinic | null>(null);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canCreate = isAdmin || canCreateClinic(userPermissions);
  const canDelete = isAdmin || canDeleteClinic(userPermissions);
  const canUpdate = isAdmin || canUpdateClinic(userPermissions);
  const canCreateBranchForClinic = isAdmin || canCreateBranch(userPermissions);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.list({ limit: 50 });
      setClinics(res.items);
      setSelectedId((prev) => prev ?? res.items[0]?.id ?? null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load clinics"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // GET /clinics only returns a lean projection (no trade_license_url, no address
  // fields) — the full record must be fetched per-clinic once one is selected.
  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let active = true;
    setSelectedLoading(true);
    clinicsApi
      .get(selectedId)
      .then((c) => {
        if (active) setSelected(c);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, "Failed to load clinic details"));
      })
      .finally(() => {
        if (active) setSelectedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const loadBranches = useCallback(async (clinicId: string) => {
    setBranchesLoading(true);
    try {
      const res = await branchesApi.list(clinicId);
      setBranches(res.items);
    } catch {
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadBranches(selectedId);
    } else {
      setBranches([]);
    }
  }, [selectedId, loadBranches]);

  useEffect(() => {
    if (selected && !selected.trade_license_url) {
      toast("Trade license: No document uploaded.", { icon: "⚠️" });
    }
  }, [selected]);

  // Consumes the "auto-create my first branch" preference set at sign-up: that
  // clinic had no trade license yet then, so the branch couldn't be created until
  // now — once the clinic has one and still has no branches, create it here.
  useEffect(() => {
    if (
      !selected ||
      branchesLoading ||
      branches.length > 0 ||
      !selected.trade_license_number ||
      !isAutoBranchPending(selected.id)
    ) {
      return;
    }
    clearAutoBranchPending(selected.id);
    autoCreateBranchForClinic(selected, branches, user?.phone)
      .then(() => {
        toast.success("Your first branch was created automatically.");
        loadBranches(selected.id);
      })
      .catch((err) => {
        setError(getErrorMessage(err, "Auto-create failed"));
      });
  }, [selected, branches, branchesLoading, user?.phone, loadBranches]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Only clinic owners can view the clinic directory.
      </div>
    );
  }

  const LICENSE_URL_FIELD: Record<ClinicLicenseType, keyof Clinic> = {
    "trade-license": "trade_license_url",
    "drug-license": "drug_license_url",
    "clinical-establishment-registration": "clinical_establishment_reg_url",
  };

  const handleLicenseUpdated = (type: ClinicLicenseType, url: string) => {
    const field = LICENSE_URL_FIELD[type];
    setSelected((prev) => (prev ? { ...prev, [field]: url } : prev));
  };

  const autoCreateBranch = async () => {
    if (!selected) return;
    if (!canCreateBranchForClinic) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await autoCreateBranchForClinic(selected, branches, user?.phone);
      toast.success("Branch created automatically.");
      await loadBranches(selected.id);
    } catch (err) {
      const message = getErrorMessage(err, "Auto-create failed");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteClinic = async () => {
    const clinic = clinicToDelete;
    if (!clinic) return;
    if (!canDelete) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setError(null);
    try {
      await clinicsApi.remove(clinic.id, true);
      if (selectedId === clinic.id) setSelectedId(null);
      await load();
      toast.success("Clinic deleted successfully.");
      setClinicToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to delete clinic. Please try again."));
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
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedId === c.id
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
              {canCreateBranchForClinic &&
                selected &&
                !branchesLoading &&
                branches.length <= 1 && (
                  <button
                    onClick={autoCreateBranch}
                    disabled={busy}
                    title={
                      branches.length === 1
                        ? "Create a second branch by duplicating this clinic's existing branch"
                        : "Create a branch automatically using this clinic's own details"
                    }
                    className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                  >
                    {busy ? "Creating…" : "Auto-create branch"}
                  </button>
                )}
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
                  onClick={() => selected && setClinicToDelete(selected)}
                  disabled={busy || !selected}
                  className="rounded-lg border border-error-500/40 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                >
                  Delete clinic
                </button>
              )}
            </div>
          </div>
          {!selectedId ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a clinic to view its details.
            </p>
          ) : selectedLoading || !selected ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading…
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
          <ClinicLicensesPanel
            clinicId={selected.id}
            clinicName={selected.name}
            onLicenseUpdated={handleLicenseUpdated}
          />
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={clinicToDelete !== null}
        onClose={() => setClinicToDelete(null)}
        onConfirm={confirmDeleteClinic}
        title={clinicToDelete ? `Clinic "${clinicToDelete.name}"` : ""}
        description="This clinic and its records will be permanently removed."
        impactItems={[
          "All branches under this clinic",
          "All doctors and staff assigned to those branches",
          "Any active appointments (they'll be cancelled automatically)",
        ]}
        confirmLabel="Delete clinic"
      />
    </div>
  );
}

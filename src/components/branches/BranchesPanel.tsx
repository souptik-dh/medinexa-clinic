"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import Tooltip from "@/components/ui/tooltip/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Branch,
  BranchLicenseType,
  Clinic,
  branchesApi,
  clinicsApi,
} from "@/lib/api";
import BranchGalleryPanel from "@/components/branches/BranchGalleryPanel";
import BranchLicensesPanel from "@/components/branches/BranchLicensesPanel";
import BranchPhotoPanel from "@/components/branches/BranchPhotoPanel";
import BranchReviewsPanel from "@/components/branches/BranchReviewsPanel";
import ConfirmDeleteModal from "@/components/common/ConfirmDeleteModal";
import RatingStars from "@/components/common/RatingStars";
import { formatDate, formatFullAddress } from "@/lib/utils";
import { autoCreateBranchForClinic } from "@/lib/autoCreateBranch";
import { getErrorMessage } from "@/lib/errorMessage";

import { useAuth } from "@/context/AuthContext";
import {
  canAccessBranchSettings,
  canCreateBranch,
  canDeleteBranch,
  canManageLabTests,
  canUpdateBranch,
} from "@/lib/permissions";

export default function BranchesPanel() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Clinic | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canCreate = isAdmin || canCreateBranch(userPermissions);
  const canDelete = isAdmin || canDeleteBranch(userPermissions);
  const canUpdate = isAdmin || canUpdateBranch(userPermissions);
  const canSchedule = isAdmin || canAccessBranchSettings(userPermissions);
  const canManageLab = isAdmin || canManageLabTests(userPermissions);

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

  // GET /clinics only returns a lean projection (no trade_license_number, no
  // address fields) — the full record must be fetched once a clinic is selected,
  // otherwise auto-create wrongly thinks the clinic has no trade license on file.
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
    } catch (err) {
      setBranches([]);
      setError(getErrorMessage(err, "Failed to load branches"));
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadBranches(selectedId);
    }
  }, [selectedId, loadBranches]);

  useEffect(() => {
    // clear selected branch when clinic selection changes
    setSelectedBranch(null);
  }, [selectedId]);

  useEffect(() => {
    if (selectedBranch && !selectedBranch.trade_license_url) {
      toast("Trade license: No document uploaded.", { icon: "⚠️" });
    }
  }, [selectedBranch]);

  const handlePhotoUpdated = (photoUrl: string) => {
    setSelectedBranch((prev) => (prev ? { ...prev, photo_url: photoUrl } : prev));
    setBranches((prev) =>
      prev.map((b) => (b.id === selectedBranch?.id ? { ...b, photo_url: photoUrl } : b))
    );
  };

  const LICENSE_URL_FIELD: Record<BranchLicenseType, keyof Branch> = {
    "trade-license": "trade_license_url",
    "drug-license": "drug_license_url",
    "clinical-establishment-registration": "clinical_establishment_reg_url",
  };

  const handleLicenseUpdated = (type: BranchLicenseType, url: string) => {
    const field = LICENSE_URL_FIELD[type];
    setSelectedBranch((prev) => (prev ? { ...prev, [field]: url } : prev));
    setBranches((prev) =>
      prev.map((b) => (b.id === selectedBranch?.id ? { ...b, [field]: url } : b))
    );
  };

  const autoCreateBranch = async () => {
    if (!selected) return;
    if (!canCreate) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await autoCreateBranchForClinic(selected, user?.phone);
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

  const confirmDeleteBranch = async () => {
    const branch = branchToDelete;
    if (!branch) return;
    if (!canDelete) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setError(null);
    try {
      await branchesApi.remove(branch.id, true);
      if (selected) await loadBranches(selected.id);
      toast.success("Branch deleted successfully.");
      setBranchToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to delete branch. Please try again."));
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Only clinic owners can view the clinic/branch directory. Branch staff
        can manage their own branch under Staff, Doctors, and Patients.
      </div>
    );
  }

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
            <Badge color="info">{branches.length} branches</Badge>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : clinics.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No clinics yet.
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
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {c.name}
                    </span>
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

        {/* Branches for selected clinic */}
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Branches
              {selected && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  — {selected.name}
                </span>
              )}
            </h3>
            {canCreate && selected && (
              <div className="flex items-center gap-2">
                {!branchesLoading && !selectedLoading && selected && branches.length < 1 && (
                  <button
                    onClick={autoCreateBranch}
                    disabled={busy}
                    title="Create a branch automatically using this clinic's own details"
                    className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                  >
                    {busy ? "Creating…" : "Auto-create branch"}
                  </button>
                )}
                <Link
                  href={`/clinics/${selected.id}/branches/new`}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  + New branch
                </Link>
              </div>
            )}
          </div>
          {!selectedId ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a clinic to manage its branches.
            </p>
          ) : selectedLoading || branchesLoading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading branches…
            </p>
          ) : !selected ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Failed to load clinic details.
            </p>
          ) : branches.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No branches for this clinic.
            </p>
          ) : (
            <div className="max-w-full">
              <Table>
                <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                  <TableRow>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Name
                    </TableCell>
                    {/* <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Address
                    </TableCell> */}
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Phone
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Rating
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="py-3">
                        <button
                          onClick={() => setSelectedBranch(b)}
                          className="text-left hover:text-brand-500"
                        >
                        <Tooltip content={formatFullAddress(b)} className="block w-full">

                          <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {b.name}
                          </p>
                          <span className="text-gray-400 text-theme-xs dark:text-gray-500">
                            {b.timezone}
                          </span>
                       </Tooltip>

                        </button>
                      </TableCell>
                      {/* <TableCell className="py-3 w-[220px] max-w-[220px] text-gray-500 text-theme-sm dark:text-gray-400">
                          <span className="block truncate">{b.address}</span>
                      </TableCell> */}
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {b.phone}
                      </TableCell>
                      <TableCell className="py-3">
                        <RatingStars average={b.rating?.average ?? null} count={b.rating?.count ?? 0} size="sm" />
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex justify-end gap-1.5">
                          {canManageLab && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/lab-tests`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              Lab Tests
                            </Link>
                          )}
                          {canManageLab && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/lab-schedule`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              Lab Schedule
                            </Link>
                          )}
                          {canSchedule && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/schedule`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              Schedule
                            </Link>
                          )}
                          {canUpdate && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/edit`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              Edit
                            </Link>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setBranchToDelete(b)}
                              disabled={busy}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Branch photo, gallery & licenses */}
      {selectedBranch && selected && (
        <div className="mt-6 space-y-6">
          <BranchPhotoPanel
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
            photoUrl={selectedBranch.photo_url}
            onPhotoUpdated={handlePhotoUpdated}
          />
          <BranchGalleryPanel branchId={selectedBranch.id} branchName={selectedBranch.name} />
          {!selectedBranch.trade_license_url && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
              <p className="font-medium text-gray-800 dark:text-white/90">
                Trade license <span className="text-error-500">*</span>
              </p>
              <p className="mt-1 text-sm text-warning-600 dark:text-orange-400">
                ⚠ No document uploaded.
              </p>
            </div>
          )}
          <BranchLicensesPanel
            clinicId={selected.id}
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
            onLicenseUpdated={handleLicenseUpdated}
          />
          <BranchReviewsPanel branchId={selectedBranch.id} />
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={branchToDelete !== null}
        onClose={() => setBranchToDelete(null)}
        onConfirm={confirmDeleteBranch}
        title={branchToDelete ? `Branch "${branchToDelete.name}"` : ""}
        description="This branch and its records will be permanently removed."
        impactItems={[
          "Doctors and staff assigned to this branch",
          "Schedules and availability for this branch",
          "Any active appointments (they'll be cancelled automatically)",
        ]}
        confirmLabel="Delete branch"
      />
    </div>
  );
}

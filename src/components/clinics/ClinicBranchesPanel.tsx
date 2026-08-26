"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
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
import FormDrawer from "@/components/common/FormDrawer";
import BranchForm from "@/components/branches/BranchForm";
import RatingStars from "@/components/common/RatingStars";
import { autoCreateBranchForClinic } from "@/lib/autoCreateBranch";
import { getErrorMessage } from "@/lib/errorMessage";
import { TableSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAuth } from "@/context/AuthContext";
import {
  canCreateBranch,
  canDeleteBranch,
  canUpdateBranch,
} from "@/lib/permissions";
import { useTranslation } from "@/hooks/useTranslation";

export default function ClinicBranchesPanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const { t } = useTranslation();

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [clinicLoading, setClinicLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const { user } = useAuth();
  const userPermissions =
    user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin =
    user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canCreate = isAdmin || canCreateBranch(userPermissions);
  const canDelete = isAdmin || canDeleteBranch(userPermissions);
  const canUpdate = isAdmin || canUpdateBranch(userPermissions);

  const loadBranches = useCallback(async () => {
    if (!clinicId) return;
    setBranchesLoading(true);
    try {
      const res = await branchesApi.list(clinicId);
      setBranches(res.items);
    } catch (err) {
      setBranches([]);
      setError(getErrorMessage(err, t("branches.failedToLoad")));
    } finally {
      setBranchesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    setClinicLoading(true);
    clinicsApi
      .get(clinicId)
      .then(setClinic)
      .catch((err) =>
        setError(getErrorMessage(err, t("clinicsPage.failedToLoadDetails")))
      )
      .finally(() => setClinicLoading(false));
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, loadBranches]);

  const handlePhotoUpdated = (photoUrl: string) => {
    setSelectedBranch((prev) =>
      prev ? { ...prev, photo_url: photoUrl } : prev
    );
    setBranches((prev) =>
      prev.map((b) =>
        b.id === selectedBranch?.id ? { ...b, photo_url: photoUrl } : b
      )
    );
  };

  const LICENSE_URL_FIELD: Record<BranchLicenseType, keyof Branch> = {
    "trade-license": "trade_license_url",
    "drug-license": "drug_license_url",
    "clinical-establishment-registration": "clinical_establishment_reg_url",
  };

  const handleLicenseUpdated = (type: BranchLicenseType, url: string) => {
    const field = LICENSE_URL_FIELD[type];
    setSelectedBranch((prev) =>
      prev ? { ...prev, [field]: url } : prev
    );
    setBranches((prev) =>
      prev.map((b) =>
        b.id === selectedBranch?.id ? { ...b, [field]: url } : b
      )
    );
  };

  const autoCreateBranch = async () => {
    if (!clinic) return;
    if (!canCreate) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await autoCreateBranchForClinic(clinic, user?.phone);
      toast.success(t("branches.branchCreatedAuto"));
      await loadBranches();
    } catch (err) {
      const message = getErrorMessage(err, t("branches.autoCreateFailed"));
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
      toast.error(t("appointments.noPermission"));
      return;
    }
    setError(null);
    try {
      await branchesApi.remove(branch.id, true);
      if (selectedBranch?.id === branch.id) setSelectedBranch(null);
      await loadBranches();
      toast.success(t("branches.branchDeletedSuccess"));
      setBranchToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err, t("branches.unableToDeleteBranch")));
    }
  };

  const filtered = branches.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.city?.toLowerCase().includes(q) ||
      b.district?.toLowerCase().includes(q)
    );
  });

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("branches.ownerOnlyNotice")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("branches.title")}
          </h3>
          <div className="flex items-center gap-2">
            {!branchesLoading &&
              !clinicLoading &&
              branches.length < 1 &&
              canCreate && (
                <button
                  onClick={autoCreateBranch}
                  disabled={busy}
                  title={t("branches.autoCreateBranchTitle")}
                  className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                >
                  {busy ? t("branches.creating") : t("branches.autoCreateBranch")}
                </button>
              )}
            {canCreate && (
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t("branches.addBranch")}
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("branches.search")}
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent pl-10 pr-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>

        {clinicLoading || branchesLoading ? (
          <TableSkeleton cols={5} />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {search
              ? t("branches.noBranchesMatchSearch")
              : t("branches.noBranchesForClinic")}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    {t("branches.branchNameColumn")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    {t("branches.location")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    {t("branches.rating")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    {t("doctors.status")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400"
                  >
                    {t("common.actions")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-3">
                      <Link
                        href={`/clinics/${clinicId}/branches/${b.id}/overview`}
                        className="font-medium text-gray-800 text-theme-sm hover:text-brand-500 dark:text-white/90"
                      >
                        {b.name}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {b.city || b.district || "—"}
                    </TableCell>
                    <TableCell className="py-3">
                      <RatingStars
                        average={b.rating?.average ?? null}
                        count={b.rating?.count ?? 0}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                        {t("status.active")}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/clinics/${clinicId}/branches/${b.id}/overview`}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                        >
                          {t("branches.open")}
                        </Link>
                        {canUpdate && (
                          <button
                            onClick={() => setEditingBranch(b)}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                          >
                            {t("common.edit")}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setBranchToDelete(b)}
                            disabled={busy}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                          >
                            {t("common.delete")}
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

      {selectedBranch && (
        <div className="space-y-6">
          <BranchPhotoPanel
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
            photoUrl={selectedBranch.photo_url}
            onPhotoUpdated={handlePhotoUpdated}
          />
          <BranchGalleryPanel
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
          />
          {!selectedBranch.trade_license_url && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
              <p className="font-medium text-gray-800 dark:text-white/90">
                {t("branches.tradeLicense")}{" "}
                <span className="text-error-500">*</span>
              </p>
              <p className="mt-1 text-sm text-warning-600 dark:text-orange-400">
                ⚠ {t("branches.noDocumentUploaded")}
              </p>
            </div>
          )}
          <BranchLicensesPanel
            clinicId={clinicId}
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
            onLicenseUpdated={handleLicenseUpdated}
          />
          <BranchReviewsPanel branchId={selectedBranch.id} />
        </div>
      )}

      {/* Add / edit branch — drawers keep the user on the Branches tab */}
      <FormDrawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("branches.addBranch")}
        description={clinic?.name}
      >
        <BranchForm
          mode="create"
          clinicId={clinicId}
          onDone={() => {
            setCreateOpen(false);
            loadBranches();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </FormDrawer>

      <FormDrawer
        isOpen={editingBranch !== null}
        onClose={() => setEditingBranch(null)}
        title={t("branches.editBranch")}
        description={editingBranch?.name}
      >
        {editingBranch && (
          <BranchForm
            mode="edit"
            clinicId={clinicId}
            branchId={editingBranch.id}
            onDone={() => {
              setEditingBranch(null);
              loadBranches();
            }}
            onCancel={() => setEditingBranch(null)}
          />
        )}
      </FormDrawer>

      <ConfirmDeleteModal
        isOpen={branchToDelete !== null}
        onClose={() => setBranchToDelete(null)}
        onConfirm={confirmDeleteBranch}
        title={
          branchToDelete
            ? t("branches.deleteBranchTitle", { name: branchToDelete.name })
            : ""
        }
        description={t("branches.deleteBranchDesc")}
        impactItems={[
          t("branches.deleteBranchImpactDoctorsStaff"),
          t("branches.deleteBranchImpactSchedules"),
          t("branches.deleteBranchImpactAppointments"),
        ]}
        confirmLabel={t("branches.deleteBranch")}
      />
    </div>
  );
}

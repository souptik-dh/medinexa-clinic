"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ListSkeleton, TableSkeleton } from "@/components/ui/skeleton/Skeleton";
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
import FormDrawer from "@/components/common/FormDrawer";
import BranchForm from "@/components/branches/BranchForm";
import RatingStars from "@/components/common/RatingStars";
import Pagination from "@/components/tables/Pagination";
import { formatDate, formatFullAddress } from "@/lib/utils";
import { autoCreateBranchForClinic } from "@/lib/autoCreateBranch";
import { getErrorMessage } from "@/lib/errorMessage";
import { usePagination } from "@/hooks/usePagination";
import { useTranslation } from "@/hooks/useTranslation";

import { useAuth } from "@/context/AuthContext";
import {
  canAccessBranchSettings,
  canCreateBranch,
  canDeleteBranch,
  canManageLabTests,
  canUpdateBranch,
} from "@/lib/permissions";

export default function BranchesPanel() {
  const { t } = useTranslation();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canCreate = isAdmin || canCreateBranch(userPermissions);
  const canDelete = isAdmin || canDeleteBranch(userPermissions);
  const canUpdate = isAdmin || canUpdateBranch(userPermissions);
  const canSchedule = isAdmin || canAccessBranchSettings(userPermissions);
  const canManageLab = isAdmin || canManageLabTests(userPermissions);

  const { page, setPage, totalPages, pageItems } = usePagination(branches, {
    resetKey: selectedId,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.list({ limit: 50 });
      setClinics(res.items);
      setSelectedId((prev) => prev ?? res.items[0]?.id ?? null);
    } catch (err) {
      setError(getErrorMessage(err, t("clinicsPage.failedToLoad")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (active)
          setError(getErrorMessage(err, t("clinicsPage.failedToLoadDetails")));
      })
      .finally(() => {
        if (active) setSelectedLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const loadBranches = useCallback(async (clinicId: string) => {
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
      toast(`${t("branches.tradeLicense")}: ${t("branches.noDocumentUploaded")}`, {
        icon: "⚠️",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.error(t("appointments.noPermission"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await autoCreateBranchForClinic(selected, user?.phone);
      toast.success(t("branches.branchCreatedAuto"));
      await loadBranches(selected.id);
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
      if (selected) await loadBranches(selected.id);
      toast.success(t("branches.branchDeletedSuccess"));
      setBranchToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err, t("branches.unableToDeleteBranch")));
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("branches.ownerOnlyNotice")}
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
              {t("clinicsPage.title")}
            </h3>
            <Badge color="info">
              {t("branchesListPage.branchesCountBadge", { count: branches.length })}
            </Badge>
          </div>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : clinics.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("branchesListPage.noClinicsYet")}
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
                      {c.description ?? t("branchesListPage.noDescription")}
                    </p>
                    <p className="mt-2 text-theme-xs text-gray-400 dark:text-gray-500">
                      {t("branchesListPage.createdOn", {
                        date: formatDate(c.created_at),
                      })}
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
              {t("branches.title")}
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
                    title={t("branches.autoCreateBranchTitle")}
                    className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                  >
                    {busy ? t("branches.creating") : t("branches.autoCreateBranch")}
                  </button>
                )}
                <button
                  onClick={() => setCreateOpen(true)}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  {t("branchesListPage.newBranchButton")}
                </button>
              </div>
            )}
          </div>
          {!selectedId ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("branchesListPage.selectClinicPrompt")}
            </p>
          ) : selectedLoading || branchesLoading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : !selected ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("clinicsPage.failedToLoadDetails")}
            </p>
          ) : branches.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("branches.noBranchesForClinic")}
            </p>
          ) : (
            <>
            <div className="max-w-full">
              <Table>
                <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                  <TableRow>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("appointments.name")}
                    </TableCell>
                    {/* <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Address
                    </TableCell> */}
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("appointments.phone")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("branches.rating")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                      {t("common.actions")}
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pageItems.map((b) => (
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
                          <Link
                            href={`/clinics/${selected?.id}/branches/${b.id}/overview`}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                          >
                            {t("branches.overview")}
                          </Link>
                          {canManageLab && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/lab-tests`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              {t("branches.labTests")}
                            </Link>
                          )}
                          {canManageLab && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/lab-schedule`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              {t("branches.labSchedule")}
                            </Link>
                          )}
                          {canSchedule && (
                            <Link
                              href={`/clinics/${selected?.id}/branches/${b.id}/schedule`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              {t("branches.schedule")}
                            </Link>
                          )}
                          {canUpdate && (
                            <button
                              onClick={() => setEditingBranch(b)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
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
            {branches.length > 10 && (
              <div className="mt-4 flex justify-center">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
            </>
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
                {t("branches.tradeLicense")} <span className="text-error-500">*</span>
              </p>
              <p className="mt-1 text-sm text-warning-600 dark:text-orange-400">
                ⚠ {t("branches.noDocumentUploaded")}
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

      {/* Add / edit branch — drawers keep the user on the current page */}
      <FormDrawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("branches.addBranch")}
        description={selected?.name}
      >
        {selected && (
          <BranchForm
            mode="create"
            clinicId={selected.id}
            onDone={() => {
              setCreateOpen(false);
              loadBranches(selected.id);
            }}
            onCancel={() => setCreateOpen(false)}
          />
        )}
      </FormDrawer>

      <FormDrawer
        isOpen={editingBranch !== null}
        onClose={() => setEditingBranch(null)}
        title={t("branches.editBranch")}
        description={editingBranch?.name}
      >
        {editingBranch && selected && (
          <BranchForm
            mode="edit"
            clinicId={selected.id}
            branchId={editingBranch.id}
            onDone={() => {
              setEditingBranch(null);
              loadBranches(selected.id);
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

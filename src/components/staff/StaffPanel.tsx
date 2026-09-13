"use client";
import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import Badge from "@/components/ui/badge/Badge";
import Pagination from "@/components/tables/Pagination";
import { useModal } from "@/hooks/useModal";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import { TableSkeleton } from "@/components/ui/skeleton/Skeleton";
import { StaffMember, staffApi } from "@/lib/api";
import { BRANCH_STAFF_PERMISSION_META, BranchStaffPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";
import { isValidPhone, PHONE_VALIDATION_MESSAGE, sanitizePhoneDigits } from "@/lib/phone";

export default function StaffPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can("staff:manage");

  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [items, setItems] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { isOpen, openModal, closeModal } = useModal();
  const { page, setPage, totalPages, pageItems } = usePagination(items, {
    resetKey: branch?.id,
  });

  const load = useCallback(async (b: BranchSelectValue | null) => {
    if (!b) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await staffApi.list(b.id);
      setItems(res.items);
    } catch (err) {
      setItems([]);
      setError(getErrorMessage(err, t("staff.failedToLoad")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const onBranchChange = (b: BranchSelectValue | null) => {
    setBranch(b);
    load(b);
  };

  const openCreate = () => {
    setName("");
    setPhone("");
    setError(null);
    openModal();
  };

  const create = async () => {
    if (!branch) return;
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    if (!isValidPhone(phone)) {
      const message = PHONE_VALIDATION_MESSAGE;
      setError(message);
      toast.error(message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await staffApi.create(branch.id, { name, phone });
      closeModal();
      await load(branch);
      toast.success(t("staff.addedSuccess"));
    } catch (err) {
      const message = getErrorMessage(err, t("staff.unableToAdd"));
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: StaffMember) => {
    if (!branch) return;
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    if (!window.confirm(t("staff.removeConfirm", { name: member.name }))) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi.remove(branch.id, member.id);
      await load(branch);
      toast.success(t("staff.removedSuccess"));
    } catch (err) {
      const message = getErrorMessage(err, t("staff.unableToRemove"));
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const openPermissions = (member: StaffMember) => {
    if (!branch) return;
    router.push(`/staff/${branch.id}/${member.id}/permissions`);
  };

  const permissionLabels = (member: StaffMember): string[] => {
    const perms = (member.permissions ?? []) as BranchStaffPermission[];
    return perms.map(
      (p) =>
        BRANCH_STAFF_PERMISSION_META.find((m) => m.permission === p)?.label ??
        p
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("staff.branchStaff")}
        </h3>
        <BranchSelect value={branch?.id ?? ""} onChange={onBranchChange} />
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("staff.title")}
            {branch && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                — {branch.name}
              </span>
            )}
          </h3>
          {canManage && (
            <button
              onClick={openCreate}
              disabled={busy || !branch}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              + {t("staff.addStaff")}
            </button>
          )}
        </div>

        {!branch ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("staff.selectBranchHint")}
          </p>
        ) : loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("staff.noStaffAtBranch")}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("staff.name")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("staff.phone")}
                  </TableCell>
                  <TableCell isHeader className="py-3 max-w-[280px] font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("staff.permissions")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 whitespace-nowrap">
                    {t("staff.added")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    {t("appointments.actions")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pageItems.map((member) => {
                  const labels = permissionLabels(member);
                  return (
                  <TableRow key={member.id}>
                    <TableCell className="py-3 align-top">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {member.name}
                      </p>
                    </TableCell>
                    <TableCell className="py-3 align-top text-gray-500 text-theme-sm dark:text-gray-400">
                      {member.phone ?? "—"}
                    </TableCell>
                    <TableCell className="py-3 align-top max-w-[280px] text-gray-500 text-theme-sm dark:text-gray-400">
                      {labels.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {labels.map((label) => (
                            <Badge key={label} size="sm" color="light">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-3 align-top whitespace-nowrap text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatDate(member.created_at)}
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        {canManage && (
                          <button
                            onClick={() => openPermissions(member)}
                            disabled={busy}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                          >
                            {t("staff.permissions")}
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => remove(member)}
                            disabled={busy}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                          >
                            {t("staff.remove")}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {items.length > 10 && (
          <div className="mt-4 flex justify-center">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Add staff modal */}
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[500px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("staff.addStaffMemberTitle")}
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("staff.loginInstructionHint")}
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("staff.nameRequired")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("staff.phoneRequired")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 pl-12 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={closeModal}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("appointments.close")}
          </button>
          <button
            onClick={create}
            disabled={busy || !name || !phone}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? t("staff.adding") : t("common.add")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

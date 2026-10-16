"use client";
import React, { useCallback, useRef, useState } from "react";
import Image from "next/image";
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
import { TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAsyncAction, useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";
import { StaffMember, staffApi } from "@/lib/api";
import Checkbox from "@/components/form/input/Checkbox";
import {
  ASSIGNABLE_STAFF_PERMISSION_META,
  BRANCH_STAFF_PERMISSION_META,
  BRANCH_STAFF_PERMISSION_MODULES,
  BranchStaffPermission,
  isAssignableStaffPermission,
} from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";
import { isValidPhone, PHONE_VALIDATION_MESSAGE, sanitizePhoneDigits } from "@/lib/phone";

const initials = (name: string): string =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export default function StaffPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can("staff:manage");

  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [items, setItems] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Independent action states: the Add form vs. each row's Remove button.
  const { pending: isSubmitting, run: runSubmit } = useAsyncAction();
  const rowAction = useKeyedAction<string>();
  const { begin, isLatest } = useLatestRequest();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const { isOpen, openModal, closeModal } = useModal();

  // Edit staff modal: details + permissions, saved in one request.
  const { isOpen: isEditOpen, openModal: openEditModal, closeModal: closeEditModal } = useModal();
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPerms, setEditPerms] = useState<BranchStaffPermission[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const { pending: isSavingEdit, run: runEditSave } = useAsyncAction();

  // Profile photo modal
  const { isOpen: isPhotoOpen, openModal: openPhotoModal, closeModal: closePhotoModal } = useModal();
  const [photoMember, setPhotoMember] = useState<StaffMember | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { pending: isUploadingPhoto, run: runPhotoUpload } = useAsyncAction();
  const photoFileRef = useRef<HTMLInputElement>(null);
  const { page, setPage, totalPages, pageItems } = usePagination(items, {
    resetKey: branch?.id,
  });

  // `silent` refreshes after a mutation without flashing the table skeleton.
  const load = useCallback(async (b: BranchSelectValue | null, opts?: { silent?: boolean }) => {
    const token = begin();
    if (!b) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
      // Don't let the previous branch's rows pose as this branch's results.
      setItems([]);
    }
    setError(null);
    try {
      const res = await staffApi.list(b.id);
      if (!isLatest(token)) return;
      setItems(res.items);
    } catch (err) {
      if (!isLatest(token)) return;
      if (!opts?.silent) setItems([]);
      setError(getErrorMessage(err, t("staff.failedToLoad")));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [t, begin, isLatest]);

  const onBranchChange = (b: BranchSelectValue | null) => {
    setBranch(b);
    load(b);
  };

  const openCreate = () => {
    setName("");
    setPhone("");
    setEmail("");
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
    const trimmedEmail = email.trim();
    // Optional — only validate the format when something was actually typed; an
    // empty field must never block staff creation.
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      const message = "Please enter a valid email address, or leave it empty.";
      setError(message);
      toast.error(message);
      return;
    }
    setError(null);
    await runSubmit(async () => {
      try {
        await staffApi.create(branch.id, { name, phone, email: trimmedEmail || null });
        closeModal();
        toast.success(t("staff.addedSuccess"));
        // The new member's server-assigned fields (id, permissions, created_at)
        // are needed, so refresh the list - silently, keeping rows on screen.
        await load(branch, { silent: true });
      } catch (err) {
        // Form fields are kept so the user can correct and retry.
        const message = getErrorMessage(err, t("staff.unableToAdd"));
        setError(message);
        toast.error(message);
      }
    });
  };

  const remove = async (member: StaffMember) => {
    if (!branch) return;
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    if (rowAction.isPending(member.id)) return;
    if (!window.confirm(t("staff.removeConfirm", { name: member.name }))) return;
    setError(null);
    await rowAction.run(member.id, async () => {
      try {
        await staffApi.remove(branch.id, member.id);
        // Targeted update - drop just this row instead of refetching the table.
        setItems((prev) => prev.filter((m) => m.id !== member.id));
        toast.success(t("staff.removedSuccess"));
      } catch (err) {
        const message = getErrorMessage(err, t("staff.unableToRemove"));
        setError(message);
        toast.error(message);
      }
    });
  };

  const openEdit = (member: StaffMember) => {
    setEditMember(member);
    setEditName(member.name);
    // Stored as +91XXXXXXXXXX; the field takes the 10 digits.
    setEditPhone(sanitizePhoneDigits((member.phone ?? "").replace(/^\+91/, "")));
    setEditEmail(member.email ?? "");
    setEditPerms(((member.permissions ?? []) as string[]).filter(isAssignableStaffPermission));
    setEditError(null);
    openEditModal();
  };

  const toggleEditPerm = (perm: BranchStaffPermission) => {
    setEditPerms((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const saveEdit = async () => {
    if (!branch || !editMember) return;
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();
    const fail = (message: string) => {
      setEditError(message);
      toast.error(message);
    };
    if (!trimmedName) return fail(t("staff.nameIsRequired"));
    if (!isValidPhone(editPhone)) return fail(PHONE_VALIDATION_MESSAGE);
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return fail("Please enter a valid email address, or leave it empty.");
    }
    setEditError(null);
    await runEditSave(async () => {
      try {
        const updated = await staffApi.update(branch.id, editMember.id, {
          name: trimmedName,
          phone: editPhone,
          email: trimmedEmail || null,
          permissions: editPerms,
        });
        setItems((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
        closeEditModal();
        toast.success(t("staff.updatedSuccess"));
      } catch (err) {
        // Fields are kept so the user can correct and retry.
        fail(getErrorMessage(err, t("staff.unableToUpdate")));
      }
    });
  };

  const openPhoto = (member: StaffMember) => {
    setPhotoMember(member);
    setPhotoError(null);
    if (photoFileRef.current) photoFileRef.current.value = "";
    openPhotoModal();
  };

  const uploadPhoto = async (file: File) => {
    if (!branch || !photoMember) return;
    await runPhotoUpload(async () => {
      setPhotoError(null);
      try {
        const res = await staffApi.uploadPhoto(branch.id, photoMember.id, file);
        setPhotoMember({ ...photoMember, photo_url: res.photo_url });
        setItems((prev) => prev.map((m) => (m.id === photoMember.id ? { ...m, photo_url: res.photo_url } : m)));
        toast.success(t("staff.photoUpdated"));
      } catch (err) {
        const message = getErrorMessage(err, t("staff.photoUploadFailed"));
        setPhotoError(message);
        toast.error(message);
      } finally {
        if (photoFileRef.current) photoFileRef.current.value = "";
      }
    });
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
              type="button"
              onClick={openCreate}
              disabled={!branch}
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
        ) : !loading && items.length === 0 ? (
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
                {loading ? (
                  <TableRowsSkeleton rows={5} cols={5} avatar actions cellClassName="py-3" />
                ) : pageItems.map((member) => {
                  const labels = permissionLabels(member);
                  const removing = rowAction.isPending(member.id);
                  return (
                  <TableRow key={member.id}>
                    <TableCell className="py-3 align-top">
                      <div className="flex items-center gap-3">
                        {member.photo_url ? (
                          <Image
                            src={member.photo_url}
                            alt={`${member.name} photo`}
                            width={40}
                            height={40}
                            unoptimized
                            className="h-10 w-10 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                            {initials(member.name)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {member.name}
                          </p>
                          {member.email && (
                            <span className="text-gray-400 text-theme-xs dark:text-gray-500">
                              {member.email}
                            </span>
                          )}
                        </div>
                      </div>
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
                            type="button"
                            onClick={() => openEdit(member)}
                            disabled={removing}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                          >
                            {t("staff.edit")}
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openPhoto(member)}
                            disabled={removing}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                          >
                            {t("staff.photo")}
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openPermissions(member)}
                            disabled={removing}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                          >
                            {t("staff.permissions")}
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => remove(member)}
                            disabled={removing}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-error-500/10"
                          >
                            {removing ? t("common.removingEllipsis") : t("staff.remove")}
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
        {!loading && items.length > 10 && (
          <div className="mt-4 flex justify-center">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Edit staff modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={closeEditModal}
        closeDisabled={isSavingEdit}
        className="max-w-[640px] p-6 lg:p-8"
      >
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("staff.editStaffTitle", { name: editMember?.name ?? "" })}
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("staff.editStaffHint")}</p>

        {editError && (
          <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {editError}
          </div>
        )}

        <div className="mt-6 max-h-[60vh] space-y-6 overflow-y-auto pr-1">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("staff.nameRequired")}
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isSavingEdit}
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
                  value={editPhone}
                  onChange={(e) => setEditPhone(sanitizePhoneDigits(e.target.value))}
                  disabled={isSavingEdit}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 pl-12 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("staff.phoneChangeHint")}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("staff.email")} <span className="text-gray-400">({t("common.optional")})</span>
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                disabled={isSavingEdit}
                placeholder="staff@clinic.com"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>

          <div>
            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("staff.permissions")}</h6>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("staff.permissionsHint")}</p>
            <div className="mt-3 space-y-5">
              {BRANCH_STAFF_PERMISSION_MODULES.map((mod) => {
                const metas = ASSIGNABLE_STAFF_PERMISSION_META.filter((m) => m.module === mod.module);
                if (metas.length === 0) return null;
                return (
                  <div key={mod.module}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {mod.label}
                    </p>
                    <div className="space-y-2">
                      {metas.map((meta) => (
                        <div
                          key={meta.permission}
                          className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800"
                        >
                          <div>
                            <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{meta.label}</p>
                            <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
                          </div>
                          <Checkbox
                            checked={editPerms.includes(meta.permission)}
                            onChange={() => toggleEditPerm(meta.permission)}
                            disabled={isSavingEdit}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeEditModal}
            disabled={isSavingEdit}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("appointments.close")}
          </button>
          <button
            type="button"
            onClick={saveEdit}
            disabled={isSavingEdit || !editName.trim() || !editPhone}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {isSavingEdit ? t("auth.saving") : t("staff.saveChanges")}
          </button>
        </div>
      </Modal>

      {/* Staff photo modal */}
      <Modal
        isOpen={isPhotoOpen}
        onClose={closePhotoModal}
        closeDisabled={isUploadingPhoto}
        className="max-w-[480px] p-6 lg:p-8"
      >
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("staff.photoTitle", { name: photoMember?.name ?? "" })}
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("staff.photoHint")}
        </p>

        {photoError && (
          <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {photoError}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4">
          {photoMember?.photo_url ? (
            <Image
              src={photoMember.photo_url}
              alt={`${photoMember.name} photo`}
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500 text-lg font-semibold text-white">
              {initials(photoMember?.name ?? "")}
            </div>
          )}
          <input
            ref={photoFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
            }}
            disabled={isUploadingPhoto}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-200"
          />
        </div>
        {isUploadingPhoto && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            {t("common.uploadingEllipsis")}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={closePhotoModal}
            disabled={isUploadingPhoto}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("common.close")}
          </button>
        </div>
      </Modal>

      {/* Add staff modal */}
      <Modal isOpen={isOpen} onClose={closeModal} closeDisabled={isSubmitting} className="max-w-[500px] p-6 lg:p-8">
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("staff.email")} <span className="text-gray-400">({t("common.optional")})</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@clinic.com"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {t("staff.emailHint")}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeModal}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("appointments.close")}
          </button>
          <button
            type="button"
            onClick={create}
            disabled={isSubmitting || !name || !phone}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {isSubmitting ? t("staff.adding") : t("common.add")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

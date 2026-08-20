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
import { useModal } from "@/hooks/useModal";
import { useAuth } from "@/context/AuthContext";
import TruckLoader from "@/components/common/TruckLoader";
import { StaffMember, staffApi } from "@/lib/api";
import { BRANCH_STAFF_PERMISSION_META, BranchStaffPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

export default function StaffPanel() {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can("staff:manage");

  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [items, setItems] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { isOpen, openModal, closeModal } = useModal();

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
      setError(getErrorMessage(err, "Failed to load staff"));
    } finally {
      setLoading(false);
    }
  }, []);

  const onBranchChange = (b: BranchSelectValue | null) => {
    setBranch(b);
    load(b);
  };

  const openCreate = () => {
    setName("");
    setEmail("");
    setError(null);
    openModal();
  };

  const create = async () => {
    if (!branch) return;
    if (!canManage) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await staffApi.create(branch.id, { name, email });
      closeModal();
      await load(branch);
      toast.success("Staff member added successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to add staff member. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: StaffMember) => {
    if (!branch) return;
    if (!canManage) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    if (!window.confirm(`Remove "${member.name}" from staff?`)) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi.remove(branch.id, member.id);
      await load(branch);
      toast.success("Staff member removed successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to remove staff member. Please try again.");
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
          Branch staff
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
            Staff
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
              + Add staff
            </button>
          )}
        </div>

        {!branch ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Select a branch to manage its staff.
          </p>
        ) : loading ? (
          <TruckLoader label="Loading staff…" />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No staff members at this branch yet.
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Name
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Email
                  </TableCell>
                  <TableCell isHeader className="py-3 max-w-[280px] font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Permissions
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 whitespace-nowrap">
                    Added
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((member) => {
                  const labels = permissionLabels(member);
                  return (
                  <TableRow key={member.id}>
                    <TableCell className="py-3 align-top">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {member.name}
                      </p>
                    </TableCell>
                    <TableCell className="py-3 align-top text-gray-500 text-theme-sm dark:text-gray-400">
                      {member.email}
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
                            Permissions
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => remove(member)}
                            disabled={busy}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                          >
                            Remove
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
      </div>

      {/* Add staff modal */}
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[500px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Add staff member
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          A login instruction email is sent automatically to the address below.
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Name *
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
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={closeModal}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Close
          </button>
          <button
            onClick={create}
            disabled={busy || !name || !email}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

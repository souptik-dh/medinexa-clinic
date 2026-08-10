"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, Branch, Clinic, branchesApi, clinicsApi } from "@/lib/api";
import BranchGalleryPanel from "@/components/branches/BranchGalleryPanel";
import { formatDate } from "@/lib/utils";

import { useAuth } from "@/context/AuthContext";
import {
  canCreateBranch,
  canDeleteBranch,
  canUpdateBranch,
} from "@/lib/permissions";

export default function BranchesPanel() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selected, setSelected] = useState<Clinic | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canCreate = isAdmin || canCreateBranch(userPermissions);
  const canDelete = isAdmin || canDeleteBranch(userPermissions);
  const canUpdate = isAdmin || canUpdateBranch(userPermissions);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.list({ limit: 50 });
      setClinics(res.items);
      setSelected((prev) => prev ?? res.items[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load clinics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadBranches = useCallback(async (clinicId: string) => {
    setBranchesLoading(true);
    try {
      const res = await branchesApi.list(clinicId);
      setBranches(res.items);
    } catch (err) {
      setBranches([]);
      setError(err instanceof ApiError ? err.message : "Failed to load branches");
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      loadBranches(selected.id);
    }
  }, [selected, loadBranches]);

  useEffect(() => {
    // clear selected branch when clinic selection changes
    setSelectedBranch(null);
  }, [selected?.id]);

  const removeBranch = async (branch: Branch) => {
    if (!window.confirm(`Delete branch "${branch.name}"? Active appointments must be handled first.`)) return;
    setBusy(true);
    setError(null);
    try {
      await branchesApi.remove(branch.id, true);
      if (selected) await loadBranches(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
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
                    onClick={() => setSelected(c)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected?.id === c.id
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
              <Link
                href={`/clinics/${selected.id}/branches/new`}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                + New branch
              </Link>
            )}
          </div>
          {!selected ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a clinic to manage its branches.
            </p>
          ) : branchesLoading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading branches…
            </p>
          ) : branches.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No branches for this clinic.
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
                      Address
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Phone
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
                          <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {b.name}
                          </p>
                          <span className="text-gray-400 text-theme-xs dark:text-gray-500">
                            {b.timezone}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {b.address}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {b.phone}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex justify-end gap-1.5">
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
                              onClick={() => removeBranch(b)}
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

      {/* Branch gallery */}
      {selectedBranch && (
        <div className="mt-6">
          <BranchGalleryPanel branchId={selectedBranch.id} branchName={selectedBranch.name} />
        </div>
      )}
    </div>
  );
}

"use client";
import React, { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import BranchFormModal, {
  BranchFormValues,
  branchFormFrom,
} from "@/components/branches/BranchFormModal";
import BranchGalleryPanel from "@/components/branches/BranchGalleryPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { ApiError, Branch, Clinic, branchesApi, clinicsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  canCreateClinic,
  canDeleteClinic,
  canUpdateClinic,
  canCreateBranch,
  canDeleteBranch,
  canUpdateBranch,
} from "@/lib/permissions";

export default function ClinicsPanel() {
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
  
  const canCreate = isAdmin || canCreateClinic(userPermissions);
  const canDelete = isAdmin || canDeleteClinic(userPermissions);
  const canUpdate = isAdmin || canUpdateClinic(userPermissions);
  const canBranchCreate = isAdmin || canCreateBranch(userPermissions);
  const canBranchDelete = isAdmin || canDeleteBranch(userPermissions);
  const canBranchUpdate = isAdmin || canUpdateBranch(userPermissions);

  const [modalMode, setModalMode] = useState<"clinic" | "branch" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const { isOpen, openModal, closeModal } = useModal();

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editValues, setEditValues] = useState<BranchFormValues>(branchFormFrom({
    name: "",
    address: "",
    phone: "",
    timezone: "Asia/Kolkata",
  }));
  const [isEditOpen, setIsEditOpen] = useState(false);

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
    } catch {
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      loadBranches(selected.id);
    }
  }, [selected, loadBranches]);

  const openCreate = (mode: "clinic" | "branch") => {
    setModalMode(mode);
    setName("");
    setDescription("");
    setAddress("");
    setPhone("");
    setError(null);
    openModal();
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      if (modalMode === "clinic") {
        await clinicsApi.create({ name, description: description || null });
      } else {
        if (!selected) return;
        await branchesApi.create(selected.id, {
          name,
          address,
          phone,
          timezone,
        });
      }
      closeModal();
      await load();
      if (modalMode === "branch" && selected) {
        await loadBranches(selected.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const removeClinic = async (clinic: Clinic) => {
    if (!window.confirm(`Delete clinic "${clinic.name}"? Active appointments must be handled first.`)) return;
    setBusy(true);
    setError(null);
    try {
      await clinicsApi.remove(clinic.id, true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const removeBranch = async (branch: Branch) => {
    if (!window.confirm(`Delete branch "${branch.name}"?`)) return;
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

  const openEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setEditValues(branchFormFrom(branch));
    setError(null);
    setIsEditOpen(true);
  };

  const submitEditBranch = async () => {
    if (!editingBranch) return;
    setBusy(true);
    setError(null);
    try {
      await branchesApi.update(editingBranch.id, {
        name: editValues.name,
        address: editValues.address,
        phone: editValues.phone,
        timezone: editValues.timezone,
        lat: editValues.lat === "" ? null : Number(editValues.lat),
        lng: editValues.lng === "" ? null : Number(editValues.lng),
      });
      setIsEditOpen(false);
      if (selected) await loadBranches(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
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
            {canCreate && (
              <button
                onClick={() => openCreate("clinic")}
                disabled={busy}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                + New clinic
              </button>
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
                    onClick={() => setSelected(c)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected?.id === c.id
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
            <div className="flex items-center gap-2">
              {canDelete && (
                <button
                  onClick={() => selected && removeClinic(selected)}
                  disabled={busy || !selected}
                  className="rounded-lg border border-error-500/40 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                >
                  Delete clinic
                </button>
              )}
              {canBranchCreate && (
                <button
                  onClick={() => openCreate("branch")}
                  disabled={busy || !selected}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
                >
                  + New branch
                </button>
              )}
            </div>
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
                          {canBranchUpdate && (
                            <button
                              onClick={() => openEditBranch(b)}
                              disabled={busy}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                            >
                              Edit
                            </button>
                          )}
                          {canBranchDelete && (
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

      {/* Create modal */}
      <Modal isOpen={isOpen && !!modalMode} onClose={closeModal} className="max-w-[500px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {modalMode === "clinic" ? "Create clinic" : "Create branch"}
        </h5>
        <div className="mt-6 space-y-4">
          <Field label="Name *">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </Field>
          {modalMode === "clinic" ? (
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </Field>
          ) : (
            <>
              <Field label="Address *">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </Field>
              <Field label="Phone *">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </Field>
              <Field label="Timezone *">
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </Field>
            </>
          )}
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
            disabled={busy || !name || (modalMode === "branch" && (!address || !phone))}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </Modal>

      {/* Edit branch modal */}
      <BranchFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        mode="edit"
        clinicName={selected?.name}
        values={editValues}
        onChange={setEditValues}
        busy={busy}
        onSubmit={submitEditBranch}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {label}
      </label>
      {children}
    </div>
  );
}

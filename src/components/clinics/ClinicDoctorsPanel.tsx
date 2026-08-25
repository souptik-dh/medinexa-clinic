"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import FormDrawer from "@/components/common/FormDrawer";
import InviteDoctorForm from "@/components/doctors/InviteDoctorForm";
import DoctorAssignmentEditPanel from "@/components/doctors/DoctorAssignmentEditPanel";
import SpecializationMultiSelectFilter from "@/components/doctors/SpecializationMultiSelectFilter";
import {
  Branch,
  BranchDoctor,
  branchesApi,
  doctorsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { getSpecializationOptions, matchesSpecializationFilter } from "@/lib/specialization";
import TruckLoader from "@/components/common/TruckLoader";
import { useAuth } from "@/context/AuthContext";

const initials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function ClinicDoctorsPanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const { can } = useAuth();
  const canManage = can("doctors:manage");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [allDoctors, setAllDoctors] = useState<
    (BranchDoctor & { branchName: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [specializationFilter, setSpecializationFilter] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<BranchDoctor | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const branchesRes = await branchesApi.list(clinicId);
      setBranches(branchesRes.items);

      const perBranch = await Promise.all(
        branchesRes.items.map(async (b) => {
          try {
            const res = await doctorsApi.listByBranch(b.id);
            return res.items.map((d) => ({ ...d, branchName: b.name }));
          } catch {
            return [];
          }
        })
      );
      setAllDoctors(perBranch.flat());
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load doctors"));
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    load();
  }, [load]);

  const specializations = useMemo(
    () => getSpecializationOptions(allDoctors),
    [allDoctors]
  );

  const filtered = useMemo(() => {
    let result = allDoctors;
    if (branchFilter) {
      result = result.filter((d) => d.branch_id === branchFilter);
    }
    if (specializationFilter.length > 0) {
      result = result.filter((d) =>
        matchesSpecializationFilter(d.specialization, specializationFilter)
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.specialization?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allDoctors, branchFilter, specializationFilter, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Doctors
          </h3>
          {canManage && (
            <button
              onClick={() => setInviteOpen(true)}
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
              Invite Doctor
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1 sm:max-w-xs">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Search
            </label>
            <div className="relative">
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
                placeholder="Search doctor..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-transparent pl-10 pr-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
          <SpecializationMultiSelectFilter
            options={specializations}
            selected={specializationFilter}
            onChange={setSpecializationFilter}
          />
          <div className="sm:w-48">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Branch
            </label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
          {loading ? (
            <TruckLoader label="Loading doctors…" />
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {search || branchFilter || specializationFilter.length > 0
                ? "No doctors match your filters."
                : "No doctors assigned yet."}
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
                      Doctor
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Specialization
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Branch
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Fee
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                    {canManage && (
                      <TableCell
                        isHeader
                        className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400"
                      >
                        Actions
                      </TableCell>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map((doc) => (
                    <TableRow key={`${doc.id}-${doc.branch_id}`}>
                      <TableCell className="py-3">
                        <Link
                          href={`/doctors/${doc.branch_id}/${doc.id}`}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          {doc.photo_url ? (
                            <Image
                              src={doc.photo_url}
                              alt={`${doc.name} photo`}
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                              {initials(doc.name)}
                            </div>
                          )}
                          <p className="font-medium text-gray-800 text-theme-sm hover:text-brand-500 dark:text-white/90">
                            {doc.name}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {doc.specialization ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {doc.branchName}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatCurrency(doc.fee_amount, doc.currency)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color="success">
                          Active
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell className="py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={() => setEditingDoctor(doc)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              Edit
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Invite / edit doctor — drawers keep the user on the Doctors tab */}
      <FormDrawer
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite doctor"
        description="A single-use invite code is emailed to the doctor."
      >
        <InviteDoctorForm
          onDone={() => {
            setInviteOpen(false);
            load();
          }}
          onCancel={() => setInviteOpen(false)}
        />
      </FormDrawer>

      <FormDrawer
        isOpen={editingDoctor !== null}
        onClose={() => setEditingDoctor(null)}
        title="Edit doctor"
        description={editingDoctor?.name}
      >
        {editingDoctor && (
          <DoctorAssignmentEditPanel
            branchId={editingDoctor.branch_id}
            doctorId={editingDoctor.id}
            onDone={() => {
              setEditingDoctor(null);
              load();
            }}
            onCancel={() => setEditingDoctor(null)}
          />
        )}
      </FormDrawer>
    </div>
  );
}

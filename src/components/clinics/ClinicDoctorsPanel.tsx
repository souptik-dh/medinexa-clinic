"use client";
import React, { useMemo, useState } from "react";
import useSWR from "swr";
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
import AddExistingDoctorForm from "@/components/doctors/AddExistingDoctorForm";
import DoctorAssignmentEditPanel from "@/components/doctors/DoctorAssignmentEditPanel";
import SpecializationMultiSelectFilter from "@/components/doctors/SpecializationMultiSelectFilter";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import {
  Branch,
  BranchDoctor,
  branchesApi,
  doctorsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { getSpecializationOptions, matchesSpecializationFilter } from "@/lib/specialization";
import { TableSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAuth } from "@/context/AuthContext";

const initials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

interface DoctorBranchInfo {
  branch_id: string;
  branchName: string;
  fee_amount: number;
  currency: string;
}

interface GroupedDoctor {
  id: string;
  name: string;
  photo_url: string | null | undefined;
  specialization: string | null;
  branches: DoctorBranchInfo[];
}

const MAX_VISIBLE_BRANCH_CHIPS = 3;

// Renders every branch a doctor is at as chips, truncated with an
// expandable "+N more" once there are more than a few — avoids duplicating
// the doctor's row per branch while still surfacing every association.
function BranchChips({
  branches,
  showFee,
}: {
  branches: DoctorBranchInfo[];
  showFee: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? branches : branches.slice(0, MAX_VISIBLE_BRANCH_CHIPS);
  const hiddenCount = branches.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((b) => (
        <span
          key={b.branch_id}
          className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
        >
          {b.branchName}
          {showFee && (
            <span className="ml-1 text-gray-400 dark:text-gray-500">
              · {formatCurrency(b.fee_amount, b.currency)}
            </span>
          )}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-theme-xs font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}

// Single "Edit" action for a doctor row: a direct button when they're only
// at one branch, or a dropdown to pick which branch's assignment to edit
// when there's more than one — the Actions column never repeats per branch.
function DoctorRowActions({
  branches,
  onEdit,
}: {
  branches: DoctorBranchInfo[];
  onEdit: (branchId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (branches.length === 1) {
    return (
      <button
        onClick={() => onEdit(branches[0].branch_id)}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="dropdown-toggle rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
      >
        Edit ▾
      </button>
      <Dropdown isOpen={open} onClose={() => setOpen(false)} className="w-48 p-1.5">
        {branches.map((b) => (
          <DropdownItem
            key={b.branch_id}
            onClick={() => {
              setOpen(false);
              onEdit(b.branch_id);
            }}
            baseClassName="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            {b.branchName}
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}

export default function ClinicDoctorsPanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const { can } = useAuth();
  const canManage = can("doctors:manage");

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [specializationFilter, setSpecializationFilter] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<{
    doctorId: string;
    branchId: string;
    name: string;
  } | null>(null);

  // Cached under the clinic id so switching tabs and coming back to Doctors
  // shows the roster instantly instead of re-running the branch+doctor
  // fan-out fetch every time.
  const {
    data,
    error: swrError,
    isLoading: loading,
    mutate: reload,
  } = useSWR(clinicId ? ["clinic-doctors", clinicId] : null, async () => {
    const branchesRes = await branchesApi.list(clinicId);
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
    return { branches: branchesRes.items, allDoctors: perBranch.flat() };
  });
  const error = swrError ? getErrorMessage(swrError, "Failed to load doctors") : null;
  const branches: Branch[] = useMemo(() => data?.branches ?? [], [data]);
  const allDoctors: (BranchDoctor & { branchName: string })[] = useMemo(
    () => data?.allDoctors ?? [],
    [data]
  );

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
          d.specialization?.toLowerCase().includes(q) ||
          d.branchName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allDoctors, branchFilter, specializationFilter, search]);

  // One row per doctor: fold every (doctor, branch) record surviving the
  // filters above into a single entry carrying all of that doctor's
  // matching branches, so the table never duplicates a doctor's row.
  const groupedDoctors: GroupedDoctor[] = useMemo(() => {
    const byId = new Map<string, GroupedDoctor>();
    for (const d of filtered) {
      let group = byId.get(d.id);
      if (!group) {
        group = {
          id: d.id,
          name: d.name,
          photo_url: d.photo_url,
          specialization: d.specialization,
          branches: [],
        };
        byId.set(d.id, group);
      }
      group.branches.push({
        branch_id: d.branch_id,
        branchName: d.branchName,
        fee_amount: d.fee_amount,
        currency: d.currency,
      });
    }
    return [...byId.values()]
      .map((g) => ({
        ...g,
        branches: [...g.branches].sort((a, b) => a.branchName.localeCompare(b.branchName)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Doctors
          </h3>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAddExistingOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              >
                Add Existing Doctor
              </button>
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
            </div>
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
            <TableSkeleton cols={6} />
          ) : groupedDoctors.length === 0 ? (
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
                  {groupedDoctors.map((doc) => {
                    const firstFee = doc.branches[0];
                    const feeVaries = doc.branches.some(
                      (b) => b.fee_amount !== firstFee.fee_amount || b.currency !== firstFee.currency
                    );
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="py-3">
                          <Link
                            href={`/doctors/${firstFee.branch_id}/${doc.id}`}
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
                        <TableCell className="py-3">
                          <BranchChips branches={doc.branches} showFee={feeVaries} />
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {feeVaries ? (
                            <span
                              className="cursor-help underline decoration-dotted"
                              title={doc.branches
                                .map((b) => `${b.branchName}: ${formatCurrency(b.fee_amount, b.currency)}`)
                                .join("\n")}
                            >
                              Varies
                            </span>
                          ) : (
                            formatCurrency(firstFee.fee_amount, firstFee.currency)
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge size="sm" color="success">
                            Active
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className="py-3">
                            <div className="flex justify-end">
                              <DoctorRowActions
                                branches={doc.branches}
                                onEdit={(branchId) =>
                                  setEditingDoctor({ doctorId: doc.id, branchId, name: doc.name })
                                }
                              />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
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
            reload();
          }}
          onCancel={() => setInviteOpen(false)}
        />
      </FormDrawer>

      {/* Add existing doctor: doctor already has an account and is already
       * associated with this clinic at another branch — no invite/token. */}
      <FormDrawer
        isOpen={addExistingOpen}
        onClose={() => setAddExistingOpen(false)}
        title="Add existing doctor"
        description="Adds a doctor already associated with this clinic to another branch."
      >
        <AddExistingDoctorForm
          onDone={() => {
            setAddExistingOpen(false);
            reload();
          }}
          onCancel={() => setAddExistingOpen(false)}
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
            branchId={editingDoctor.branchId}
            doctorId={editingDoctor.doctorId}
            onDone={() => {
              setEditingDoctor(null);
              reload();
            }}
            onCancel={() => setEditingDoctor(null)}
          />
        )}
      </FormDrawer>
    </div>
  );
}

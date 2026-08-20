"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TruckLoader from "@/components/common/TruckLoader";
import {
  LabTest,
  LabTestStatus,
  LabTestCategory,
  LabTestCategoryOption,
  labTestsApi,
} from "@/lib/api";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import { labTestCategoryLabel } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

const STATUS_OPTIONS: (LabTestStatus | "")[] = ["", "active", "inactive"];

export default function LabTestsPanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const [items, setItems] = useState<LabTest[]>([]);
  const [statusFilter, setStatusFilter] = useState<LabTestStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<LabTestCategory | "">("");
  const [categoryOptions, setCategoryOptions] = useState<LabTestCategoryOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Category is clinic-defined free text now, so the filter options come from
  // what this clinic has actually used rather than a fixed list.
  useEffect(() => {
    labTestsApi.categories(clinicId).then((res) => setCategoryOptions(res.items)).catch(() => {});
  }, [clinicId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await labTestsApi.list({
        clinic_id: clinicId,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
        limit: 50,
      });
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load lab tests"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, statusFilter, categoryFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async (item: LabTest) => {
    setTogglingId(item.id);
    try {
      await labTestsApi.toggleStatus(item.id, item.status === "active" ? "inactive" : "active");
      await load();
      toast.success("Lab test status updated.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update lab test status"));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <ClinicTabs />
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
        <FilterField label="Status">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LabTestStatus | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s === "" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Category">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as LabTestCategory | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.id ?? c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Search">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Test name..."
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </FilterField>
        <button
          onClick={load}
          className="h-11 rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Refresh
        </button>
        <Link
          href={`/clinics/${clinicId}/lab-tests/new`}
          className="flex h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
        >
          + New Test
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {loading ? (
          <TruckLoader label="Loading lab tests…" />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No lab tests found.
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
                    Category
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Code
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Status
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-gray-500 text-theme-xs dark:text-gray-400 truncate max-w-[200px]">
                          {item.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge size="sm" color="light">
                        {labTestCategoryLabel(item.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {item.code}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge
                        size="sm"
                        color={item.status === "active" ? "success" : "dark"}
                      >
                        {item.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/clinics/${clinicId}/lab-tests/${item.id}/edit`}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleToggleStatus(item)}
                          disabled={togglingId === item.id}
                          className={`rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            item.status === "active"
                              ? "text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10"
                              : "text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10"
                          }`}
                        >
                          {item.status === "active" ? "Deactivate" : "Activate"}
                        </button>
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
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:w-48">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

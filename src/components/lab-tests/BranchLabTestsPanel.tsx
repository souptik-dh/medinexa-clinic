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
import BranchTabs from "@/components/branches/BranchTabs";
import TruckLoader from "@/components/common/TruckLoader";
import { BranchLabTest, branchLabTestsApi } from "@/lib/api";
import { labTestCategoryLabel, formatCurrency } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

export default function BranchLabTestsPanel() {
  const params = useParams<{ clinicId?: string; branchId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const [items, setItems] = useState<BranchLabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await branchLabTestsApi.list(branchId);
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load branch lab tests"));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async (item: BranchLabTest) => {
    setTogglingId(item.id);
    try {
      await branchLabTestsApi.update(branchId, item.id, {
        status: item.status === "active" ? "inactive" : "active",
      });
      await load();
      toast.success("Branch lab test status updated.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update status"));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <BranchTabs />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Lab Tests
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Refresh
            </button>
            <Link
              href={`/clinics/${clinicId}/branches/${branchId}/lab-tests/new`}
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
              Configure Test
            </Link>
          </div>
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
              No lab tests configured for this branch yet.
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
                      Test Name
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Category
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Price
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Availability
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400"
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="py-3">
                        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {item.test_name}
                        </p>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color="light">
                          {labTestCategoryLabel(item.test_category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatCurrency(item.price, item.currency)}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {[
                          item.clinic_available && "Clinic",
                          item.home_collection_available && "Home",
                        ]
                          .filter(Boolean)
                          .join(" + ") || "—"}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          size="sm"
                          color={
                            item.status === "active" ? "success" : "dark"
                          }
                        >
                          {item.status === "active"
                            ? "Active"
                            : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/clinics/${clinicId}/branches/${branchId}/lab-tests/${item.id}/edit`}
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
                            {item.status === "active"
                              ? "Deactivate"
                              : "Activate"}
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
    </div>
  );
}

"use client";
import React, { useCallback, useEffect, useState } from "react";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, Patient, patientsApi } from "@/lib/api";
import { TableSkeleton } from "@/components/ui/skeleton/Skeleton";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

const PAGE_SIZE = 20;

export default function PatientsPanel() {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [items, setItems] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | "new" | "old">("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (b: BranchSelectValue | null, nextOffset: number, append: boolean) => {
      if (!b) {
        setItems([]);
        setHasMore(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await patientsApi.listByBranch(b.id, {
          search: search || undefined,
          type: type || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setHasMore(res.has_more);
        setOffset(nextOffset);
      } catch (err) {
        if (!append) setItems([]);
        setError(err instanceof ApiError ? err.message : t("patients.failedToLoad"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, type, t]
  );

  useEffect(() => {
    load(branch, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, search, type]);

  const onBranchChange = (b: BranchSelectValue | null) => {
    setBranch(b);
  };

  const loadMore = () => {
    if (!branch) return;
    load(branch, offset + PAGE_SIZE, true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("patients.title")}
        </h3>
        <BranchSelect value={branch?.id ?? ""} onChange={onBranchChange} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("common.search")}
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("patients.searchPlaceholder")}
              disabled={!branch}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50"
            />
          </div>
          <div className="sm:w-48">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("patients.type")}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "" | "new" | "old")}
              disabled={!branch}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50"
            >
              <option value="">{t("patients.allPatients")}</option>
              <option value="new">{t("patients.new")}</option>
              <option value="old">{t("patients.returning")}</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("patients.title")}
            {branch && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                — {branch.name}
              </span>
            )}
          </h3>
        </div>

        {!branch ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("patients.selectBranchHint")}
          </p>
        ) : loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("patients.noPatientsForBranch")}
          </p>
        ) : (
          <>
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                  <TableRow>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.name")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.contact")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.address")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.visits")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.type")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.firstVisit")}
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      {t("patients.lastVisit")}
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell className="py-3">
                        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {patient.name}
                        </p>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        <p>{patient.email}</p>
                        {patient.phone && (
                          <p className="text-theme-xs text-gray-400 dark:text-gray-500">
                            {patient.phone}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {patient.address ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {patient.visit_count}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color={patient.is_new_patient ? "info" : "success"}>
                          {patient.is_new_patient ? t("patients.new") : t("patients.returning")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatDate(patient.first_visit_date)}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatDate(patient.last_visit_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {loadingMore ? t("common.loading") : t("patients.loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

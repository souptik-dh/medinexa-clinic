"use client";
import React, { useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { ApiError, Clinic, LedgerEntry, clinicsApi, ledgerApi } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

export default function LedgerPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [month, setMonth] = useState("");
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    clinicsApi
      .list({ limit: 100 })
      .then((res) => {
        setClinics(res.items);
        setClinicId((prev) => prev || res.items[0]?.id || "");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("billing.failedToLoadClinics"));
      });
  }, [isOwner, t]);

  const load = useCallback(async () => {
    if (!clinicId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ledgerApi.list(clinicId, month || undefined);
      setItems(res.items);
    } catch (err) {
      setItems([]);
      setError(err instanceof ApiError ? err.message : t("ledger.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, month, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("ledger.ownerOnlyNotice")}
      </div>
    );
  }

  const totalsByCurrency = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.currency] = (acc[item.currency] ?? 0) + item.total_amount;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("ledger.title")}
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("billing.clinic")}
            </label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">{t("billing.selectClinic")}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-48">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("ledger.month")}
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          {month && (
            <button
              onClick={() => setMonth("")}
              className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("ledger.clearMonth")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(totalsByCurrency).map(([currency, total]) => (
            <div
              key={currency}
              className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t("ledger.totalCurrency", { currency })}
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {formatCurrency(total, currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {!clinicId ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("ledger.selectClinicHint")}
          </p>
        ) : loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("ledger.noPaymentsRecorded", { suffix: month ? t("ledger.inThisMonth") : "" })}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("ledger.branch")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("ledger.period")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("ledger.total")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("ledger.payments")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("ledger.updated")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {entry.branch_name}
                      </p>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {entry.period_month}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatCurrency(entry.total_amount, entry.currency)}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {entry.payment_count}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatDateTime(entry.updated_at)}
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

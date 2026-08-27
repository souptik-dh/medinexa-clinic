"use client";
import React, { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, superAdminApi } from "@/lib/api";
import type { SubscriptionPayment } from "@/lib/api";
import { formatCurrency, formatDateTime, subscriptionPaymentStatusColor } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

const PAYMENT_STATUS_KEY: Record<string, string> = {
  PENDING: "billing.pending",
  PAID: "billing.paid",
  FAILED: "billing.failed",
};

export default function SuperAdminPaymentsPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<SubscriptionPayment[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor?: string, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await superAdminApi.payments({
          status: (status || undefined) as never,
          from: from || undefined,
          to: to || undefined,
          limit: nextCursor ? undefined : 20,
          cursor: nextCursor,
        });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.next_cursor ?? undefined);
      } catch (err) {
        if (!append) setItems([]);
        setError(err instanceof ApiError ? err.message : t("billing.failedToLoadPayments"));
      } finally {
        setLoading(false);
      }
    },
    [status, from, to, t]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:p-6">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">{t("billing.allStatuses")}</option>
          <option value="PENDING">{t("billing.pending")}</option>
          <option value="PAID">{t("billing.paid")}</option>
          <option value="FAILED">{t("billing.failed")}</option>
        </select>
        <div>
          <label className="sr-only">{t("appointments.from")}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div>
          <label className="sr-only">{t("appointments.to")}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {error && <p className="p-6 text-sm text-error-500">{error}</p>}
        {!error && items.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("superAdminPayments.noPaymentsFound")}
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto p-4 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminClinics.clinic")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.invoiceCol")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.amountCol")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.months")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("dashboard.status")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.created")}</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                      {(p as SubscriptionPayment & { clinic_name?: string | null }).clinic_name || p.clinic_id.slice(0, 8) + "…"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {p.invoice_no}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatCurrency(p.amount, p.currency)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">{p.months}</TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge size="sm" color={subscriptionPaymentStatusColor(p.status)}>
                        {PAYMENT_STATUS_KEY[p.status] ? t(PAYMENT_STATUS_KEY[p.status]) : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-gray-400">
                      {formatDateTime(p.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {cursor && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => load(cursor, true)}
                  disabled={loading}
                  className="text-sm font-medium text-brand-500 hover:underline disabled:opacity-60"
                >
                  {loading ? t("common.loading") : t("patients.loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
        {loading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">{t("common.loading")}</p>
        )}
      </div>
    </div>
  );
}

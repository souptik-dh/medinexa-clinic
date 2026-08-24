"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, SuperAdminPlanVersion, superAdminApi } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function SuperAdminPlansPanel() {
  const [items, setItems] = useState<SuperAdminPlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // publish form
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [trialMonths, setTrialMonths] = useState("1");
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminApi.plans();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await superAdminApi.publishPlan({
        monthly_amount: Number(monthlyAmount),
        currency: currency || undefined,
        trial_months: trialMonths === "" ? undefined : Number(trialMonths),
      });
      toast.success(res.message || "New plan version published.");
      setMonthlyAmount("");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to publish plan");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Publish new price
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Publishing a new amount creates an immutable plan version. New clinics and
          renewals use the active version; existing subscriptions keep their locked-in
          amount.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-40">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
              Monthly amount
            </label>
            <input
              type="number"
              min={0}
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
              placeholder="999"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="sm:w-28">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
              Currency
            </label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="sm:w-32">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
              Trial months
            </label>
            <input
              type="number"
              min={0}
              value={trialMonths}
              onChange={(e) => setTrialMonths(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <button
            onClick={publish}
            disabled={publishing || !monthlyAmount || Number(monthlyAmount) <= 0}
            className="inline-flex h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {error && <p className="p-6 text-sm text-error-500">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No plan versions yet.
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto p-4 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Name</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Monthly</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Trial</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">State</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Effective from</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Created by</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">{p.name}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                      {formatCurrency(p.monthly_amount, p.currency)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">{p.trial_months} mo</TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge size="sm" color={p.is_active ? "success" : "light"}>
                        {p.is_active ? "Active" : "Superseded"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {p.effective_from ? formatDateTime(p.effective_from) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-gray-400">
                      {p.created_by_email ?? "—"} · {formatDateTime(p.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {loading && (
          <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
        )}
      </div>
    </div>
  );
}

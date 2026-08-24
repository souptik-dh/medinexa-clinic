"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { ApiError, SuperAdminStatistics, superAdminApi } from "@/lib/api";
import { formatCurrency, subscriptionStatusColor, subscriptionStatusLabel } from "@/lib/utils";
import TruckLoader from "@/components/common/TruckLoader";

export default function PlatformStatisticsPanel() {
  const [stats, setStats] = useState<SuperAdminStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await superAdminApi.statistics());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load statistics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runSweep = async () => {
    setProcessing(true);
    try {
      const res = await superAdminApi.processSubscriptions();
      toast.success(
        `${res.message} (expired trials: ${res.result.expiredTrials}, expired subscriptions: ${res.result.expiredSubscriptions}, expiring notified: ${res.result.expiringNotified})`
      );
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to process subscriptions");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <TruckLoader label="Loading platform statistics…" />;
  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
        {error ?? "Statistics unavailable."}
      </div>
    );
  }

  const statuses: (keyof typeof stats.clinics.by_status)[] = [
    "TRIAL",
    "ACTIVE",
    "EXPIRED",
    "INACTIVE",
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Platform-wide snapshot of clinics and subscription revenue.
        </p>
        <button
          onClick={runSweep}
          disabled={processing}
          className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {processing ? "Processing…" : "Run subscription sweep"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total clinics" value={stats.clinics.total.toLocaleString()} />
        <StatCard label={`Expiring ≤ ${stats.clinics.expiring_window_days} days`} value={stats.clinics.expiring_within_days.toLocaleString()} />
        <StatCard label="Lifetime collected" value={formatCurrency(stats.revenue_inr.total_collected)} />
        <StatCard label="MRR estimate" value={formatCurrency(stats.mrr_estimate_inr)} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Clinics by status
        </h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {statuses.map((s) => (
            <Link key={s} href={`/super-admin/clinics?status=${s}`}>
              <Badge color={subscriptionStatusColor(s)}>
                {subscriptionStatusLabel(s)}: {stats.clinics.by_status[s] ?? 0}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Monthly collection ({stats.current_plan.currency})
        </h3>
        <div className="mt-4 space-y-2">
          {stats.revenue_inr.monthly_breakdown.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              No collections recorded yet.
            </p>
          )}
          {stats.revenue_inr.monthly_breakdown.map((m) => {
            const max = Math.max(
              ...stats.revenue_inr.monthly_breakdown.map((x) => x.amount),
              1
            );
            return (
              <div key={m.month} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-gray-500 dark:text-gray-400">{m.month}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.round((m.amount / max) * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-gray-800 dark:text-white/90">
                  {formatCurrency(m.amount)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">{m.count} pmt</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Current plan: <span className="font-medium text-gray-800 dark:text-white/90">{stats.current_plan.name}</span> ·{" "}
        {formatCurrency(stats.current_plan.monthly_amount, stats.current_plan.currency)} / month ·{" "}
        This month:{" "}
        <span className="font-medium text-gray-800 dark:text-white/90">
          {formatCurrency(stats.revenue_inr.current_month)}
        </span>{" "}
        · Previous month:{" "}
        <span className="font-medium text-gray-800 dark:text-white/90">
          {formatCurrency(stats.revenue_inr.previous_month)}
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <h4 className="mt-2 text-xl font-bold text-gray-800 dark:text-white/90">{value}</h4>
    </div>
  );
}

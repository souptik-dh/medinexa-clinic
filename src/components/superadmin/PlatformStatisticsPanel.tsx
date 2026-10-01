"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { ApiError, SuperAdminStatistics, superAdminApi } from "@/lib/api";
import { formatCurrency, subscriptionStatusColor, subscriptionStatusLabel } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useTranslation } from "@/hooks/useTranslation";

export default function PlatformStatisticsPanel() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<SuperAdminStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { pending: processing, run: runSweepAction } = useAsyncAction();

  // `silent` refreshes after the sweep without swapping the page for skeletons.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setStats(await superAdminApi.statistics());
    } catch (err) {
      // A failed silent refresh keeps the stats already on screen.
      if (!opts?.silent) setError(err instanceof ApiError ? err.message : t("superAdmin.failedToLoadStatistics"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const runSweep = () =>
    runSweepAction(async () => {
      try {
        const res = await superAdminApi.processSubscriptions();
        toast.success(
          t("superAdmin.sweepResult", {
            message: res.message,
            expiredTrials: res.result.expiredTrials,
            expiredSubscriptions: res.result.expiredSubscriptions,
            expiringNotified: res.result.expiringNotified,
          })
        );
        load({ silent: true });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("superAdmin.failedToProcessSubscriptions"));
      }
    });

  if (loading) {
    // Same section layout as the loaded view, so nothing jumps when data lands.
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{t("common.loading")}</span>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // Mirrors StatCard below (label + value, no icon tile).
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <Skeleton className="h-5 w-40" />
          <div className="mt-3 flex flex-wrap gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-24 rounded-full" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <Skeleton className="h-5 w-48" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-2.5 w-full rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
        {error ?? t("superAdmin.statisticsUnavailable")}
        <button
          type="button"
          onClick={() => load()}
          className="ml-3 font-medium underline hover:no-underline"
        >
          {t("common.retry")}
        </button>
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
          {t("superAdmin.snapshot")}
        </p>
        <button
          type="button"
          onClick={runSweep}
          disabled={processing}
          className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {processing ? t("superAdmin.processingEllipsis") : t("superAdmin.runSweep")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("superAdmin.totalClinics")} value={stats.clinics.total.toLocaleString()} />
        <StatCard label={t("superAdmin.expiringWithinDays", { days: stats.clinics.expiring_window_days })} value={stats.clinics.expiring_within_days.toLocaleString()} />
        <StatCard label={t("superAdmin.lifetimeCollected")} value={formatCurrency(stats.revenue_inr.total_collected)} />
        <StatCard label={t("superAdmin.mrrEstimate")} value={formatCurrency(stats.mrr_estimate_inr)} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("superAdmin.clinicsByStatus")}
        </h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {statuses.map((s) => (
            <Link key={s} href={`/super-admin/clinics?status=${s}`}>
              <Badge color={subscriptionStatusColor(s)}>
                {subscriptionStatusLabel(s, t)}: {stats.clinics.by_status[s] ?? 0}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("superAdmin.monthlyCollection", { currency: stats.current_plan.currency })}
        </h3>
        <div className="mt-4 space-y-2">
          {stats.revenue_inr.monthly_breakdown.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("superAdmin.noCollectionsYet")}
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
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">{m.count} {t("superAdmin.pmt")}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("superAdmin.currentPlanSummary", {
          planName: stats.current_plan.name,
          amount: formatCurrency(stats.current_plan.monthly_amount, stats.current_plan.currency),
          current: formatCurrency(stats.revenue_inr.current_month),
          previous: formatCurrency(stats.revenue_inr.previous_month),
        })}
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

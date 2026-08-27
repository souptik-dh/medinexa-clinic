"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { ApiError, SuperAdminStatistics, superAdminApi } from "@/lib/api";
import { formatCurrency, subscriptionStatusColor, subscriptionStatusLabel } from "@/lib/utils";
import { StatGridSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

export default function PlatformStatisticsPanel() {
  const { t } = useTranslation();
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
      setError(err instanceof ApiError ? err.message : t("superAdmin.failedToLoadStatistics"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const runSweep = async () => {
    setProcessing(true);
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
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("superAdmin.failedToProcessSubscriptions"));
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <StatGridSkeleton count={4} />;
  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
        {error ?? t("superAdmin.statisticsUnavailable")}
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
          onClick={runSweep}
          disabled={processing}
          className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
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

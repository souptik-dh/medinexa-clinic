"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  Appointment,
  AppointmentStatus,
  Clinic,
  appointmentsApi,
  clinicsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { SelectSkeleton, Skeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useLatestRequest } from "@/hooks/useAsyncAction";

type Period = "week" | "month" | "quarter" | "all";

const PERIOD_KEYS: Record<Period, string> = {
  week: "reports.last7days",
  month: "reports.thisMonth",
  quarter: "reports.last90days",
  all: "reports.allTime",
};

const STATUS_ORDER: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
  "no_show",
];

const STATUS_KEYS: Record<AppointmentStatus, string> = {
  pending: "status.pending",
  confirmed: "status.confirmed",
  paid: "status.paid",
  completed: "status.completed",
  cancelled: "status.cancelled",
  no_show: "status.noShow",
};

function pad(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// API timestamp → YYYY-MM-DD in the browser's timezone (periods count an
// appointment by when it was BOOKED).
function localYmd(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return pad(d);
}

function initialsOf(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() ||
    "?"
  );
}

export default function ReportsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(isOwner);
  const [clinicId, setClinicId] = useState("");
  const [all, setAll] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const { begin, isLatest } = useLatestRequest();

  useEffect(() => {
    if (!isOwner) return;
    clinicsApi
      .list({ limit: 100 })
      .then((res) => {
        setClinics(res.items);
        setClinicId((prev) => prev || res.items[0]?.id || "");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("reports.loadFailed"));
      })
      .finally(() => setClinicsLoading(false));
  }, [isOwner, t]);

  const load = useCallback(async () => {
    const token = begin();
    if (!clinicId) {
      setAll([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await appointmentsApi.list({ clinic_id: clinicId, limit: 200 });
      if (!isLatest(token)) return;
      setAll(res.items);
    } catch (err) {
      if (!isLatest(token)) return;
      setAll([]);
      setError(err instanceof ApiError ? err.message : t("reports.loadFailed"));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [clinicId, t, begin, isLatest]);

  useEffect(() => {
    load();
  }, [load]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { from: pad(start), to: pad(now) };
    }
    if (period === "quarter") {
      const start = new Date(now);
      start.setDate(now.getDate() - 89);
      return { from: pad(start), to: pad(now) };
    }
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: pad(start), to: pad(now) };
    }
    return { from: "", to: "" };
  }, [period]);

  const scoped = useMemo(() => {
    const { from, to } = dateRange;
    if (!from) return all;
    return all.filter((a) => {
      const booked = localYmd(a.created_at);
      return booked >= from && booked <= to;
    });
  }, [all, dateRange]);

  const stats = useMemo(() => {
    const total = scoped.length;
    const revenue = scoped
      .filter((a) => a.status === "paid" || a.status === "completed")
      .reduce((s, a) => s + (a.fee_amount || 0), 0);
    const completed = scoped.filter((a) => a.status === "completed").length;
    const cancelled = scoped.filter((a) => a.status === "cancelled").length;
    const paid = scoped.filter((a) => a.status === "paid").length;
    const paidVisits = completed + paid;
    return {
      total,
      revenue,
      completed,
      cancelled,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      avgPerVisit: paidVisits ? Math.round(revenue / paidVisits) : 0,
    };
  }, [scoped]);

  const statusRows = useMemo(
    () =>
      STATUS_ORDER.map((s) => {
        const count = scoped.filter((a) => a.status === s).length;
        return {
          key: s,
          label: t(STATUS_KEYS[s]),
          count,
          pct: scoped.length ? (count / scoped.length) * 100 : 0,
        };
      }).filter((r) => r.count > 0),
    [scoped, t]
  );

  const doctorStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>();
    for (const a of scoped) {
      const name = a.doctor_name || a.doctor_id;
      const rev = a.status === "paid" || a.status === "completed" ? a.fee_amount || 0 : 0;
      const row = map.get(name) ?? { name, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += rev;
      map.set(name, row);
    }
    const doctors = [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
    const byRevenue = doctors.some((d) => d.revenue > 0);
    const top = Math.max(1, ...doctors.map((d) => (byRevenue ? d.revenue : d.count)));
    return doctors.map((d) => ({
      ...d,
      share: ((byRevenue ? d.revenue : d.count) / top) * 100,
      initials: initialsOf(d.name),
    }));
  }, [scoped]);

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("reports.ownerOnlyNotice")}
      </div>
    );
  }

  const showSkeleton = loading || (clinicsLoading && !clinicId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("reports.title")}
          </h3>
          <div className="sm:w-64">
            {clinicsLoading ? (
              <SelectSkeleton />
            ) : (
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
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_KEYS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                period === p
                  ? "bg-brand-500 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              }`}
            >
              {t(PERIOD_KEYS[p])}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
          {clinicId && !loading && (
            <button
              type="button"
              onClick={load}
              className="ml-3 font-medium underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      {!clinicId && !showSkeleton ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          {t("reports.selectClinicHint")}
        </div>
      ) : showSkeleton ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-16" />
            </div>
          ))}
        </div>
      ) : scoped.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          {t("reports.noData")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t("reports.totalAppointments")} value={String(stats.total)} />
            <StatCard label={t("reports.revenue")} value={formatCurrency(stats.revenue)} />
            <StatCard
              label={t("reports.completionRate")}
              value={`${stats.completionRate}%`}
            />
            <StatCard label={t("reports.avgPerVisit")} value={formatCurrency(stats.avgPerVisit)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
              <h4 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
                {t("reports.byStatus")}
              </h4>
              <div className="space-y-3">
                {statusRows.map((row) => (
                  <div key={row.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                      <span className="font-medium text-gray-800 dark:text-white/90">
                        {row.count}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
              <h4 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
                {t("reports.byDoctor")}
              </h4>
              {doctorStats.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("reports.noDoctors")}
                </p>
              ) : (
                <div className="space-y-3">
                  {doctorStats.map((d) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-500 dark:bg-brand-500/15">
                        {d.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                            {d.name}
                          </span>
                          <span className="shrink-0 text-sm font-medium text-gray-800 dark:text-white/90">
                            {formatCurrency(d.revenue)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full rounded-full bg-success-500"
                            style={{ width: `${d.share}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {t("reports.appointmentsCount", { count: d.count })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

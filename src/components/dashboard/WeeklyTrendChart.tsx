"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import type { Appointment } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";

// ApexCharts touches `window`, so it's only ever loaded in the browser.
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Appointments and revenue per visit day over the last 7 days (today included).
 * Two small charts sharing one x-axis instead of a dual-axis chart, so neither
 * measure's scale distorts the other. Revenue counts paid + completed visits.
 */
export default function WeeklyTrendChart({
  appointments,
  currency,
  loading,
}: {
  appointments: Appointment[];
  currency: string;
  loading: boolean;
}) {
  const { t, locale } = useTranslation();
  const { theme } = useTheme();
  const dark = theme === "dark";

  const { labels, counts, revenue } = useMemo(() => {
    const days: { key: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: ymd(d),
        label: d.toLocaleDateString(locale === "bn" ? "bn-IN" : "en-IN", {
          weekday: "short",
          day: "numeric",
        }),
      });
    }
    const countMap = new Map<string, number>();
    const revenueMap = new Map<string, number>();
    for (const a of appointments) {
      countMap.set(a.scheduled_date, (countMap.get(a.scheduled_date) ?? 0) + 1);
      if (a.status === "paid" || a.status === "completed") {
        revenueMap.set(a.scheduled_date, (revenueMap.get(a.scheduled_date) ?? 0) + (a.fee_amount || 0));
      }
    }
    return {
      labels: days.map((d) => d.label),
      counts: days.map((d) => countMap.get(d.key) ?? 0),
      revenue: days.map((d) => revenueMap.get(d.key) ?? 0),
    };
  }, [appointments, locale]);

  const baseOptions = (color: string, formatter: (v: number) => string): ApexOptions => ({
    colors: [color],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      toolbar: { show: false },
      zoom: { enabled: false },
      background: "transparent",
    },
    plotOptions: {
      bar: { columnWidth: "45%", borderRadius: 4, borderRadiusApplication: "end" },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: dark ? "#1f2937" : "#f2f4f7",
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: dark ? "#98a2b3" : "#667085", fontSize: "11px" } },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        style: { colors: dark ? "#98a2b3" : "#667085", fontSize: "11px" },
        formatter: (v: number) => formatter(v),
      },
    },
    tooltip: {
      theme: dark ? "dark" : "light",
      y: { formatter: (v: number) => formatter(v) },
    },
    legend: { show: false },
    states: { hover: { filter: { type: "darken" } } },
  });

  const countOptions = baseOptions("#465fff", (v) => String(Math.round(v)));
  const revenueOptions = baseOptions("#0ba5ec", (v) => formatCurrency(v, currency));

  const totalCount = counts.reduce((s, n) => s + n, 0);
  const totalRevenue = revenue.reduce((s, n) => s + n, 0);

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("dashboard.weeklyTrend")}
      </h3>
      <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
        {t("dashboard.weeklyTrendHint")}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[
          {
            key: "count",
            title: t("dashboard.trendAppointments"),
            total: String(totalCount),
            options: countOptions,
            data: counts,
          },
          {
            key: "revenue",
            title: t("dashboard.trendRevenue"),
            total: formatCurrency(totalRevenue, currency),
            options: revenueOptions,
            data: revenue,
          },
        ].map((c) => (
          <div key={c.key} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">{c.title}</span>
              {loading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <span className="font-semibold text-gray-800 dark:text-white/90">{c.total}</span>
              )}
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-[200px] w-full rounded-xl" />
            ) : (
              <div className="-ml-3 mt-1">
                <ReactApexChart
                  key={`${c.key}-${dark ? "d" : "l"}`}
                  options={c.options}
                  series={[{ name: c.title, data: c.data }]}
                  type="bar"
                  height={210}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

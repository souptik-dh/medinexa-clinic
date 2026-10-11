"use client";
import React, { useState } from "react";
import Link from "next/link";
import type { Appointment, AppointmentStatus } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";

export const STATUS_KEY: Record<string, string> = { no_show: "noShow" };

const STATUS_ORDER: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
  "no_show",
];

const STATUS_BAR: Record<AppointmentStatus, string> = {
  pending: "bg-warning-500",
  confirmed: "bg-blue-light-500",
  paid: "bg-brand-500",
  completed: "bg-success-500",
  cancelled: "bg-error-500",
  no_show: "bg-gray-400 dark:bg-gray-500",
};

// Local YYYY-MM-DD (not UTC — toISOString() is still "yesterday" early morning in IST).
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function addDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

/** The browser's local "today" as an ISO [start, end) pair, for paid_from/paid_to. */
export function localDayBounds(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Money collected today by payment time, whatever the visit date (a visit next
 * week paid today counts today). Today's paid/completed visits with no payment
 * record (older data) still count, once. paid_at is re-checked so a backend
 * that ignored paid_from couldn't inflate the total.
 */
export function collectedToday(paidToday: Appointment[], todays: Appointment[]): number {
  const { start, end } = localDayBounds();
  const map = new Map<string, Appointment>();
  for (const a of paidToday) {
    if (!a.paid_at) continue;
    const at = new Date(a.paid_at);
    if (at >= start && at < end) map.set(a.id, a);
  }
  for (const a of todays) {
    if ((a.status === "paid" || a.status === "completed") && !a.paid_at) map.set(a.id, a);
  }
  return [...map.values()]
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + (a.fee_amount || 0), 0);
}

export function initialsOf(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() ||
    "?"
  );
}

const CARD = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

export function MetricCard({
  icon,
  label,
  value,
  hint,
  href,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
        {icon}
      </div>
      <div className="mt-5">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-16" />
        ) : (
          <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">{value}</h4>
        )}
        {hint && <p className="mt-1 text-theme-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`${CARD} block p-5 transition hover:border-brand-300 dark:hover:border-brand-500/40 md:p-6`}
      >
        {body}
      </Link>
    );
  }
  return <div className={`${CARD} p-5 md:p-6`}>{body}</div>;
}

/** Today's appointments split by status, as proportional bars. */
export function StatusBreakdown({
  appointments,
  loading,
  hideEmpty = false,
}: {
  appointments: Appointment[];
  loading: boolean;
  hideEmpty?: boolean;
}) {
  const { t } = useTranslation();
  const total = appointments.length;
  const rows = STATUS_ORDER.map((s) => {
    const count = appointments.filter((a) => a.status === s).length;
    return { key: s, count, pct: total ? (count / total) * 100 : 0 };
  }).filter((r) => !hideEmpty || r.count > 0);

  return (
    <div className={`${CARD} flex h-full flex-col p-5 sm:p-6`}>
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("dashboard.todayByStatus")}
      </h3>
      <div className="flex-1">
        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            {[60, 40, 30, 50, 20, 15].map((w, i) => (
              <div key={i}>
                <Skeleton className="mb-1.5 h-3 w-24" />
                <Skeleton className="h-2 rounded-full" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState message={t("dashboard.noAppointmentsToday")} />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">
                    {t(`status.${STATUS_KEY[row.key] ?? row.key}`)}
                  </span>
                  <span className="font-medium text-gray-800 dark:text-white/90">{row.count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full ${STATUS_BAR[row.key]}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 text-sm dark:border-gray-800">
        <span className="text-gray-500 dark:text-gray-400">
          {loading ? "" : t("dashboard.countToday", { count: total })}
        </span>
        <Link href="/appointments" className="font-medium text-brand-500 hover:text-brand-600">
          {t("dashboard.viewAll")} &rarr;
        </Link>
      </div>
    </div>
  );
}

/** Round photo with an initials fallback (also used when the URL fails to load). */
export function Avatar({
  name,
  photoUrl,
  size = "h-10 w-10",
}: {
  name: string;
  photoUrl?: string | null;
  size?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = photoUrl?.trim();
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-500 dark:bg-brand-500/15`}
    >
      {initialsOf(name)}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl bg-gray-50 px-4 text-center text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
      {message}
    </div>
  );
}

export const SEE_ALL_CLASS =
  "inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200";

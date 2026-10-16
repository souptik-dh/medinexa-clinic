"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  Appointment,
  AppointmentStatus,
  appointmentsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useLatestRequest } from "@/hooks/useAsyncAction";

const STATUS_KEYS: Record<AppointmentStatus, string> = {
  pending: "status.pending",
  confirmed: "status.confirmed",
  paid: "status.paid",
  completed: "status.completed",
  cancelled: "status.cancelled",
  no_show: "status.noShow",
};

function isCancelled(status: AppointmentStatus): boolean {
  return status === "cancelled" || status === "no_show";
}

function pad(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface DayCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  count: number;
  total: number;
  cancelledCount: number;
}

export default function AppointmentsCalendar() {
  const { t, locale } = useTranslation();
  const { user, clinic, staffClinic } = useAuth();
  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const clinicId = isOwner ? clinic?.id : staffClinic?.id;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [byDate, setByDate] = useState<Record<string, Appointment[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const { begin, isLatest } = useLatestRequest();

  const first = useMemo(() => new Date(year, month, 1), [year, month]);
  const last = useMemo(() => new Date(year, month + 1, 0), [year, month]);

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    setByDate({});
    try {
      const res = await appointmentsApi.list({
        clinic_id: clinicId,
        date_from: pad(first.getFullYear(), first.getMonth() + 1, 1),
        date_to: pad(last.getFullYear(), last.getMonth() + 1, last.getDate()),
        limit: 200,
      });
      if (!isLatest(token)) return;
      const map: Record<string, Appointment[]> = {};
      for (const a of res.items) {
        (map[a.scheduled_date] ??= []).push(a);
      }
      setByDate(map);
    } catch (err) {
      if (!isLatest(token)) return;
      setByDate({});
      setError(err instanceof ApiError ? err.message : t("calendar.loadError"));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [clinicId, first, last, t, begin, isLatest]);

  useEffect(() => {
    load();
  }, [load]);

  const cells = useMemo<DayCell[]>(() => {
    const startWeekday = first.getDay();
    const daysInMonth = last.getDate();
    const todayStr = pad(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const out: DayCell[] = [];
    for (let i = 0; i < startWeekday; i++) {
      out.push({ date: "", day: 0, inMonth: false, isToday: false, count: 0, total: 0, cancelledCount: 0 });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = pad(year, month + 1, d);
      const dayAppts = byDate[dateStr] ?? [];
      out.push({
        date: dateStr,
        day: d,
        inMonth: true,
        isToday: dateStr === todayStr,
        count: dayAppts.length,
        total: dayAppts.reduce((s, a) => (isCancelled(a.status) ? s : s + (a.fee_amount || 0)), 0),
        cancelledCount: dayAppts.filter((a) => isCancelled(a.status)).length,
      });
    }
    while (out.length % 7 !== 0) {
      out.push({ date: "", day: 0, inMonth: false, isToday: false, count: 0, total: 0, cancelledCount: 0 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last, byDate, year, month]);

  const monthLabel = first.toLocaleDateString(locale === "bn" ? "bn-IN" : "en-IN", {
    month: "long",
    year: "numeric",
  });

  const weekdayLabels = useMemo(() => {
    // 2024-01-07 is a Sunday — use it to render localized weekday initials.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 7 + i).toLocaleDateString(locale === "bn" ? "bn-IN" : "en-IN", {
        weekday: "short",
      })
    );
  }, [locale]);

  const selected = selectedDate ? byDate[selectedDate] ?? [] : [];

  const prevMonth = () => {
    setSelectedDate("");
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    setSelectedDate("");
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{monthLabel}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              aria-label={t("common.previous")}
              className="h-9 w-9 rounded-lg border border-gray-300 text-lg leading-none text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDate("");
                setYear(now.getFullYear());
                setMonth(now.getMonth());
              }}
              className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("calendar.today")}
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label={t("common.next")}
              className="h-9 w-9 rounded-lg border border-gray-300 text-lg leading-none text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              ›
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
            <button
              type="button"
              onClick={load}
              className="ml-3 font-medium underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdayLabels.map((w) => (
            <div
              key={w}
              className="py-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
            >
              {w}
            </div>
          ))}
          {cells.map((cell, i) =>
            !cell.inMonth ? (
              <div key={`e-${i}`} className="h-20 rounded-lg" />
            ) : (
              <button
                key={cell.date}
                type="button"
                onClick={() => setSelectedDate(cell.date)}
                className={`flex h-20 flex-col items-start gap-1 rounded-lg border p-2 text-left transition ${
                  selectedDate === cell.date
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                    : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"
                } ${cell.isToday ? "ring-1 ring-brand-400" : ""}`}
              >
                <span
                  className={`text-sm font-medium ${
                    cell.isToday
                      ? "text-brand-500"
                      : "text-gray-800 dark:text-white/90"
                  }`}
                >
                  {cell.day}
                </span>
                {loading ? null : cell.count > 0 ? (
                  <>
                    <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                      {cell.count}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {formatCurrency(cell.total)}
                    </span>
                  </>
                ) : null}
              </button>
            )
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h4 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
          {selectedDate ? selectedDate : t("calendar.selectDateHint")}
        </h4>
        {!selectedDate ? null : selected.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("calendar.noEvents")}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {selected.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {a.scheduled_time} · {a.patient?.name ?? a.patient_details?.name ?? t("appointments.patient")}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {a.doctor_name ?? ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {formatCurrency(a.fee_amount)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      isCancelled(a.status)
                        ? "bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400"
                        : "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400"
                    }`}
                  >
                    {t(STATUS_KEYS[a.status])}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {selectedDate && (
          <div className="mt-4 flex justify-end">
            <Link
              href="/appointments"
              className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              {t("calendar.manageInAppointments")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

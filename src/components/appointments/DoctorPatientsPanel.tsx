"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { Appointment, AppointmentStatus, appointmentsApi } from "@/lib/api";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  addDays,
  formatDate,
  today,
} from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

const PAGE_SIZE = 10;

interface Props {
  doctorId: string;
  branchId: string;
  doctorName: string;
  branchName: string;
  date: string;
}

export default function DoctorPatientsPanel({
  doctorId,
  branchId,
  doctorName,
  branchName,
  date,
}: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The doctor-day the dashboard card advertised. Both ends of the window are
  // the same day - this is a single-day list, not a range. Without a `date` in
  // the URL we fall back to tomorrow, matching the card's own default.
  const targetDate = date || addDays(today(), 1);

  const load = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await appointmentsApi.list({
          doctor_id: doctorId,
          branch_id: branchId || undefined,
          date_from: targetDate,
          date_to: targetDate,
          limit: PAGE_SIZE,
          cursor: nextCursor ?? undefined,
        });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.next_cursor);
      } catch (err) {
        if (!append) setItems([]);
        setError(getErrorMessage(err, t("appointments.failedToLoadAppointments")));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [doctorId, branchId, targetDate, t]
  );

  useEffect(() => {
    if (!doctorId) {
      setItems([]);
      setLoading(false);
      return;
    }
    load(null, false);
  }, [doctorId, load]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    load(cursor, true);
  };

  // Search is a client-side filter over the rows already fetched, so it never
  // triggers a request of its own.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((a) => {
      const name = a.patient?.name ?? a.patient_details?.name ?? "";
      const phone = a.patient?.mobile ?? a.patient_details?.phone ?? "";
      return name.toLowerCase().includes(term) || (phone ?? "").includes(term);
    });
  }, [items, search]);

  if (!doctorId) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("doctorPatients.missingDoctor")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {doctorName || t("doctorPatients.title")}
        </h3>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
          {[branchName, formatDate(targetDate)].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-72">
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
              {t("common.search")}
            </label>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700">
              <svg
                className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("doctorPatients.searchPlaceholder")}
                className="h-full w-full border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-0 focus:outline-hidden dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[86px] animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          {t("doctorPatients.noPatients")}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((appt) => (
            <li
              key={appt.id}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {appt.patient?.name ?? appt.patient_details?.name ?? appt.patient_id}
                </p>
                <Badge size="sm" color={appointmentStatusColor(appt.status as AppointmentStatus)}>
                  {appointmentStatusLabel(appt.status as AppointmentStatus, t)}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-theme-xs text-gray-500 sm:grid-cols-3 dark:text-gray-400">
                <div className="flex gap-1.5">
                  <dt className="shrink-0">{t("appointments.scheduled")}</dt>
                  <dd className="text-gray-800 dark:text-white/90">{formatDate(appt.scheduled_date)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0">{t("doctorPatients.time")}</dt>
                  <dd className="text-gray-800 dark:text-white/90">{appt.scheduled_time || "—"}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0">{t("doctorPatients.contact")}</dt>
                  <dd className="text-gray-800 dark:text-white/90">
                    {appt.patient?.mobile ?? appt.patient_details?.phone ?? "—"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.03]"
          >
            {loadingMore ? t("common.loading") : t("common.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}

"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import {
  ApiError,
  BranchOperatingDay,
  DoctorAssignmentSummary,
  DoctorProfile,
  branchScheduleApi,
  doctorsApi,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { weekdayShortLabel } from "@/components/doctors/scheduleShared";
import { useTranslation } from "@/hooks/useTranslation";

export default function DoctorMySchedulePanel() {
  const { t } = useTranslation();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [assignments, setAssignments] = useState<DoctorAssignmentSummary[]>([]);
  const [operatingDaysByBranch, setOperatingDaysByBranch] = useState<
    Record<string, BranchOperatingDay[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, res] = await Promise.all([doctorsApi.me(), doctorsApi.myAssignments()]);
      setDoctor(me);
      setAssignments(res.items);

      const schedules = await Promise.all(
        res.items.map((a) =>
          branchScheduleApi
            .get(a.branch_id)
            .then((s) => [a.branch_id, s.operating_days] as const)
            .catch(() => [a.branch_id, []] as const)
        )
      );
      setOperatingDaysByBranch(Object.fromEntries(schedules));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("doctorMySchedule.failedToLoadSchedule"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <DetailSkeleton rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {doctor && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("doctorMySchedule.drPrefix", { name: doctor.name })}
          </h3>
          {doctor.specialization && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{doctor.specialization}</p>
          )}
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("doctorMySchedule.notAssigned")}
          </p>
        </div>
      ) : (
        assignments.map((a) => {
          const operatingDays = operatingDaysByBranch[a.branch_id] ?? [];
          const closedDays = operatingDays.filter((d) => !d.is_open).map((d) => weekdayShortLabel(d.weekday, t));
          return (
            <div
              key={a.assignment_id}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                    {a.branch_name}
                  </h4>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {a.start_date ? formatDate(a.start_date) : "—"}
                    {" – "}
                    {a.end_date ? formatDate(a.end_date) : t("doctorMySchedule.ongoing")}
                    <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
                    {a.slot_type === "sequential" ? t("bookAppointmentModal.asPerBookings") : t("bookAppointmentModal.fixedSlots")}
                  </p>
                  <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                    {closedDays.length > 0
                      ? t("doctorMySchedule.clinicClosed", { days: closedDays.join(", ") })
                      : t("doctorMySchedule.clinicOpenEveryDay")}
                  </p>
                </div>
                <Link
                  href={`/doctors/${a.branch_id}/${doctor?.id}/edit`}
                  className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  {t("doctorMySchedule.manageSchedule")}
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

"use client";
import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton, StatCardSkeleton, TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import {
  Appointment,
  ApiError,
  BranchDoctor,
  Clinic,
  ClinicDoctorAvailability,
  appointmentsApi,
  clinicsApi,
  doctorsApi,
  labTestAppointmentsApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  formatCurrency,
  today,
} from "@/lib/utils";
import {
  BoxIconLine,
  BoxCubeIcon,
  CalenderIcon,
  CheckCircleIcon,
  DollarLineIcon,
  GroupIcon,
  PieChartIcon,
  TimeIcon,
} from "@/icons";
import WeeklyTrendChart from "./WeeklyTrendChart";
import {
  Avatar,
  EmptyState,
  MetricCard,
  SEE_ALL_CLASS,
  STATUS_KEY,
  StatusBreakdown,
  addDaysYmd,
  collectedToday,
  localDayBounds,
} from "./DashboardWidgets";

interface OwnerData {
  kind: "owner";
  clinics: Clinic[];
  recent: Appointment[];
  week: Appointment[];
  todays: Appointment[];
  collected: number;
  // null when the lab list failed (the card shows "—" instead of a wrong 0).
  labToday: number | null;
}

interface StaffData {
  kind: "staff";
  todays: Appointment[];
  collected: number;
  confirmedCount: number;
  doctors: BranchDoctor[] | null;
  doctorTotal: number | null;
}

type DashboardData = OwnerData | StaffData;

// Counts every lab appointment matching the filter by following the cursor.
async function countLabAppointments(date: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await labTestAppointmentsApi.list({ date_from: date, date_to: date, limit: 100, cursor });
    count += res.items.length;
    if (!res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return count;
}

function bySchedule(a: Appointment, b: Appointment): number {
  return (
    a.scheduled_date.localeCompare(b.scheduled_date) ||
    (a.scheduled_time || "").localeCompare(b.scheduled_time || "")
  );
}

export default function Dashboard() {
  const { user, staffClinic, staffBranch } = useAuth();
  const { t } = useTranslation();
  const isBranchStaff = user?.role === "branch_staff";
  const staffBranchId = staffBranch?.id ?? null;
  const statusLabel = (status: string) => t(`status.${STATUS_KEY[status] ?? status}`);

  const fetchDashboard = useCallback(async (): Promise<DashboardData> => {
    const day = today();
    const { start, end } = localDayBounds();
    // "Collected today" by payment time; a failure here only drops the
    // payments-for-other-days part of the figure, not the whole dashboard.
    const paidTodayReq = appointmentsApi
      .listAll({ paid_from: start.toISOString(), paid_to: end.toISOString() })
      .catch(() => [] as Appointment[]);

    if (isBranchStaff) {
      // branch_staff has no reason to fetch the full clinics directory -
      // their view is scoped to the single clinic/branch on their session
      // (see staffClinic/staffBranch from GET /branch-staff/me); the
      // appointments API scopes them to their branch server-side.
      const [todays, paidToday, confirmed, doctorRes] = await Promise.all([
        appointmentsApi.listAll({ date_from: day, date_to: day }),
        paidTodayReq,
        appointmentsApi.listAll({ status: "confirmed", date_from: day }),
        staffBranchId ? doctorsApi.listByBranch(staffBranchId).catch(() => null) : Promise.resolve(null),
      ]);
      return {
        kind: "staff",
        todays,
        collected: collectedToday(paidToday, todays),
        confirmedCount: confirmed.length,
        doctors: doctorRes?.items ?? null,
        doctorTotal: doctorRes ? doctorRes.total ?? doctorRes.items.length : null,
      };
    }

    const [clinicRes, recentRes, week, paidToday, labToday] = await Promise.all([
      clinicsApi.list({ limit: 50 }),
      appointmentsApi.list({ limit: 100 }),
      appointmentsApi.listAll({ date_from: addDaysYmd(-6), date_to: day }),
      paidTodayReq,
      countLabAppointments(day).catch(() => null),
    ]);
    const todays = week.filter((a) => a.scheduled_date === day);
    return {
      kind: "owner",
      clinics: clinicRes.items,
      recent: recentRes.items,
      week,
      todays,
      collected: collectedToday(paidToday, todays),
      labToday,
    };
  }, [isBranchStaff, staffBranchId]);

  // Cached by SWR under this key, so returning to the dashboard after
  // visiting another page renders the previous result instantly while a
  // fresh copy revalidates in the background instead of a full skeleton.
  const { data, error, isLoading, mutate } = useSWR(
    user ? ["dashboard", isBranchStaff, staffBranchId] : null,
    fetchDashboard
  );

  // While loading, the real layout renders with skeleton cards/rows in place,
  // so the grid, headings and "See all" link don't jump when data arrives.
  if (error && !data && !isLoading) {
    return (
      <div className="rounded-2xl border border-error-500/30 bg-error-50 p-6 text-error-600 dark:bg-error-500/10 dark:text-error-400">
        <p className="font-medium">
          {error instanceof ApiError ? error.message : t("dashboard.failedToLoad")}
        </p>
        <p className="mt-1 text-sm">
          {t("dashboard.apiHint")}
        </p>
        <button
          type="button"
          onClick={() => mutate()}
          className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t("dashboard.retry")}
        </button>
      </div>
    );
  }

  const loading = isLoading || !data;
  const iconCls = "text-gray-800 size-6 dark:text-white/90";

  if (isBranchStaff) {
    const staff = data?.kind === "staff" ? data : null;
    const todays = staff?.todays ?? [];
    const currency = todays[0]?.currency ?? "INR";
    const schedule = todays
      .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
      .sort(bySchedule);

    return (
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:gap-10 md:p-6">
          <div>
            <p className="text-theme-xs text-gray-400 dark:text-gray-500">{t("dashboard.clinic")}</p>
            <h4 className="font-semibold text-gray-800 dark:text-white/90">{staffClinic?.name ?? "—"}</h4>
          </div>
          <div>
            <p className="text-theme-xs text-gray-400 dark:text-gray-500">{t("appointments.branch")}</p>
            <h4 className="font-semibold text-gray-800 dark:text-white/90">{staffBranch?.name ?? "—"}</h4>
          </div>
        </div>

        <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
          <MetricCard
            icon={<CalenderIcon className={iconCls} />}
            label={t("dashboard.appointmentsToday")}
            value={String(todays.length)}
            hint={t("dashboard.scheduledToday")}
            href="/appointments"
            loading={loading}
          />
          <MetricCard
            icon={<DollarLineIcon className={iconCls} />}
            label={t("dashboard.collectedToday")}
            value={formatCurrency(staff?.collected ?? 0, currency)}
            hint={t("dashboard.collectedTodayHint")}
            href="/ledger"
            loading={loading}
          />
          <MetricCard
            icon={<CheckCircleIcon className={iconCls} />}
            label={t("status.confirmed")}
            value={String(staff?.confirmedCount ?? 0)}
            hint={t("dashboard.fromTodayOnward")}
            href="/appointments"
            loading={loading}
          />
          <MetricCard
            icon={<GroupIcon className={iconCls} />}
            label={t("dashboard.doctors")}
            value={staff?.doctorTotal == null ? "—" : String(staff.doctorTotal)}
            hint={t("dashboard.onYourTeam")}
            href="/doctors"
            loading={loading}
          />
        </div>

        {/* Today's schedule */}
        <div className="col-span-12 xl:col-span-8">
          <div className="h-full rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {t("dashboard.todaySchedule")}
              </h3>
              <Link href="/appointments" className={SEE_ALL_CLASS}>
                {t("dashboard.seeAll")}
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-14" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : schedule.length === 0 ? (
              <EmptyState message={t("dashboard.noAppointmentsScheduledToday")} />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {schedule.slice(0, 12).map((appt) => (
                  <li key={appt.id} className="flex items-center gap-4 py-3">
                    <div className="w-14 shrink-0 text-sm font-semibold text-gray-800 dark:text-white/90">
                      {appt.scheduled_time?.slice(0, 5) || "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
                        {appt.patient_details?.name || appt.patient?.name || t("dashboard.patient")}
                      </p>
                      <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
                        {appt.doctor_name ?? t("dashboard.doctor")} · {formatCurrency(appt.fee_amount, appt.currency)}
                      </p>
                    </div>
                    <Badge size="sm" color={appointmentStatusColor(appt.status)}>
                      {statusLabel(appt.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <StatusBreakdown appointments={todays} loading={loading} hideEmpty />
        </div>

        {/* Doctors on duty */}
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("dashboard.doctorsOnDuty")}
            </h3>
            <Link href="/doctors" className={SEE_ALL_CLASS}>
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {loading ? (
            <DoctorGridSkeleton />
          ) : staff?.doctors == null ? (
            <EmptyState message={t("dashboard.doctorsFailed")} />
          ) : staff.doctors.length === 0 ? (
            <EmptyState message={t("dashboard.noDoctorsAssigned")} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {staff.doctors.map((d) => (
                <li
                  key={d.assignment_id || d.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800"
                >
                  <Avatar name={d.name} photoUrl={d.photo_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{d.name}</p>
                    <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
                      {d.specialization || "—"}
                    </p>
                    {d.next_available_slot && (
                      <p className="mt-0.5 truncate text-theme-xs text-gray-400 dark:text-gray-500">
                        {t("dashboard.nextSlot", { slot: formatSlot(d.next_available_slot) })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const owner = data?.kind === "owner" ? data : null;
  const clinics = owner?.clinics ?? [];
  const todays = owner?.todays ?? [];
  const recent = [...(owner?.recent ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);
  const currency = owner?.week[0]?.currency ?? owner?.recent[0]?.currency ?? "INR";
  const branchCount = clinics.reduce((sum, c) => sum + (c.branch_count ?? 0), 0);

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* Metrics */}
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 2xl:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              icon={<BoxCubeIcon className={iconCls} />}
              label={t("dashboard.clinics")}
              value={String(clinics.length)}
              href="/clinics"
            />
            <MetricCard
              icon={<BoxIconLine className={iconCls} />}
              label={t("dashboard.branches")}
              value={String(branchCount)}
              href="/branches"
            />
            <MetricCard
              icon={<CalenderIcon className={iconCls} />}
              label={t("dashboard.appointmentsToday")}
              value={String(todays.length)}
              hint={t("dashboard.scheduledToday")}
              href="/appointments"
            />
            <MetricCard
              icon={<PieChartIcon className={iconCls} />}
              label={t("dashboard.labAppointmentsToday")}
              value={owner?.labToday == null ? "—" : String(owner.labToday)}
              hint={t("dashboard.scheduledToday")}
              href="/lab-test-appointments"
            />
            <MetricCard
              icon={<DollarLineIcon className={iconCls} />}
              label={t("dashboard.collectedToday")}
              value={formatCurrency(owner?.collected ?? 0, currency)}
              hint={t("dashboard.collectedTodayHint")}
              href="/ledger"
            />
          </>
        )}
      </div>

      {/* 7-day trend + today by status */}
      <div className="col-span-12 xl:col-span-8">
        <WeeklyTrendChart appointments={owner?.week ?? []} currency={currency} loading={loading} />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <StatusBreakdown appointments={todays} loading={loading} />
      </div>

      {/* Upcoming doctors */}
      <div className="col-span-12">
        <UpcomingDoctors clinicIds={clinics.map((c) => c.id)} parentLoading={loading} />
      </div>

      {/* Recent appointments */}
      <div className="col-span-12 overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("dashboard.recentAppointments")}
            </h3>
          </div>
          <Link href="/appointments" className={SEE_ALL_CLASS}>
            {t("dashboard.seeAll")}
          </Link>
        </div>
        {!loading && recent.length === 0 ? (
          <EmptyState message={t("dashboard.noAppointments")} />
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.scheduled")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.doctor")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.fee")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.status")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <TableRowsSkeleton rows={5} cols={4} cellClassName="py-3" />
                ) : recent.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {appt.scheduled_date}
                      </p>
                      <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                        {appt.scheduled_time} · {appt.duration_minutes}m
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {appt.doctor_name ?? shortId(appt.doctor_id)}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatCurrency(appt.fee_amount, appt.currency)}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge size="sm" color={appointmentStatusColor(appt.status)}>
                        {statusLabel(appt.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Doctors scheduled on the chosen day across the owner's clinics, from
 * GET /clinics/:id/doctor-availability. Loaded separately from the main
 * dashboard so a slow/failed availability call never blocks the rest.
 */
function UpcomingDoctors({ clinicIds, parentLoading }: { clinicIds: string[]; parentLoading: boolean }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState<0 | 1>(1);
  const date = addDaysYmd(offset);
  const idsKey = clinicIds.slice(0, 10).join(",");

  const { data, error, isLoading, mutate } = useSWR(
    !parentLoading && idsKey ? ["dashboard-doctors", idsKey, date] : null,
    async () => {
      const results = await Promise.all(
        idsKey.split(",").map((id) => clinicsApi.doctorAvailability(id, { date }))
      );
      // The API can repeat a doctor across branches; collapse genuine duplicates.
      const seen = new Set<string>();
      const rows: ClinicDoctorAvailability[] = [];
      for (const res of results) {
        for (const row of res.doctors ?? []) {
          const key = `${row.doctor_id}|${row.branch_id}|${row.date}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(row);
        }
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name) || a.branch_name.localeCompare(b.branch_name));
    }
  );

  const rows = useMemo(() => (data ?? []).slice(0, 12), [data]);
  const showSkeleton = parentLoading || (isLoading && !data);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("dashboard.upcomingDoctors")}
        </h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
            {([0, 1] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOffset(o)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  offset === o
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                }`}
              >
                {t(o === 0 ? "dashboard.today" : "dashboard.tomorrow")}
              </button>
            ))}
          </div>
          <Link href="/doctors" className={SEE_ALL_CLASS}>
            {t("dashboard.seeAll")}
          </Link>
        </div>
      </div>

      {showSkeleton ? (
        <DoctorGridSkeleton />
      ) : error && !data ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-error-50 p-4 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          <span>{error instanceof ApiError ? error.message : t("dashboard.doctorsFailed")}</span>
          <button type="button" onClick={() => mutate()} className="font-medium underline hover:no-underline">
            {t("dashboard.retry")}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message={t("dashboard.noUpcomingDoctors")} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => {
            const slots = row.available_slots.map((s) => s.time.slice(0, 5));
            const slotWindow =
              slots.length === 0 ? "" : slots.length === 1 ? slots[0] : `${slots[0]} – ${slots[slots.length - 1]}`;
            const href = `/doctor-patients?${new URLSearchParams({
              doctor_id: row.doctor_id,
              branch_id: row.branch_id,
              date: row.date,
              name: row.name,
              branch: row.branch_name,
            }).toString()}`;
            return (
              <li
                key={`${row.doctor_id}|${row.branch_id}|${row.date}`}
                className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={row.name} photoUrl={row.photo_url} size="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-theme-sm font-semibold text-gray-800 dark:text-white/90">{row.name}</p>
                    {row.specialization && (
                      <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">{row.specialization}</p>
                    )}
                    <p className="truncate text-theme-xs text-gray-400 dark:text-gray-500">
                      <BoxIconLine className="mr-1 inline size-3.5 align-[-2px]" />
                      {row.branch_name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {slotWindow && (
                    <span
                      title={t("dashboard.openSlots")}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    >
                      <TimeIcon className="size-3.5" />
                      {slotWindow}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    <GroupIcon className="size-3.5" />
                    {t(
                      row.appointments_count === 1 ? "dashboard.doctorPatients" : "dashboard.doctorPatientsPlural",
                      { count: row.appointments_count }
                    )}
                  </span>
                  <Link
                    href={href}
                    className="ml-auto rounded-lg border border-brand-300 px-3 py-1.5 text-theme-xs font-medium text-brand-500 hover:bg-brand-50 dark:border-brand-500/40 dark:hover:bg-brand-500/10"
                  >
                    {t("dashboard.viewPatients")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DoctorGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

// next_available_slot is an ISO-ish "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD HH:mm" string.
function formatSlot(slot: string): string {
  const d = new Date(slot.includes("T") ? slot : slot.replace(" ", "T"));
  if (isNaN(d.getTime())) return slot;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

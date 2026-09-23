"use client";
import React, { useCallback } from "react";
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
import {
  Appointment,
  ApiError,
  Clinic,
  appointmentsApi,
  clinicsApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  formatCurrency,
  today,
} from "@/lib/utils";
import { BoxIconLine, BoxCubeIcon, CalenderIcon, DollarLineIcon } from "@/icons";

interface DashboardData {
  clinics: Clinic[];
  appointments: Appointment[];
}

const STATUS_KEY: Record<string, string> = { no_show: "noShow" };

export default function Dashboard() {
  const { user, staffClinic, staffBranch } = useAuth();
  const { t } = useTranslation();
  const isBranchStaff = user?.role === "branch_staff";
  const statusLabel = (status: string) => t(`status.${STATUS_KEY[status] ?? status}`);

  const fetchDashboard = useCallback(async (): Promise<DashboardData> => {
    // branch_staff has no reason to fetch the full clinics directory -
    // their view is scoped to the single clinic/branch on their session
    // (see staffClinic/staffBranch from GET /branch-staff/me).
    const [clinicRes, apptRes] = await Promise.all([
      isBranchStaff ? Promise.resolve({ items: [] as Clinic[] }) : clinicsApi.list({ limit: 50 }),
      appointmentsApi.list({ limit: 100 }),
    ]);
    return {
      clinics: clinicRes.items,
      appointments: apptRes.items,
    };
  }, [isBranchStaff]);

  // Cached by SWR under this key, so returning to the dashboard after
  // visiting another page renders the previous result instantly while a
  // fresh copy revalidates in the background instead of a full skeleton.
  const { data, error, isLoading, mutate } = useSWR(
    user ? ["dashboard", isBranchStaff] : null,
    fetchDashboard
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-error-500/30 bg-error-50 p-6 text-error-600 dark:bg-error-500/10 dark:text-error-400">
        <p className="font-medium">
          {error instanceof ApiError ? error.message : t("dashboard.failedToLoad")}
        </p>
        <p className="mt-1 text-sm">
          {t("dashboard.apiHint")}
        </p>
        <button
          onClick={() => mutate()}
          className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t("dashboard.retry")}
        </button>
      </div>
    );
  }

  const clinics = data?.clinics ?? [];
  const appointments = data?.appointments ?? [];

  const branchCount = clinics.reduce((sum, c) => sum + (c.branch_count ?? 0), 0);
  const todays = appointments.filter((a) => a.scheduled_date === today());
  const collected = appointments
    .filter((a) => a.status === "paid" || a.status === "completed")
    .reduce((sum, a) => sum + a.fee_amount, 0);
  const currency = appointments[0]?.currency ?? "INR";

  const recent = [...appointments]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* Metrics */}
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        {isBranchStaff ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 sm:col-span-2">
            <p className="text-theme-xs text-gray-400 dark:text-gray-500">{t("dashboard.clinic")}</p>
            <h4 className="font-semibold text-gray-800 dark:text-white/90">
              {staffClinic?.name ?? "—"}
            </h4>
            <p className="mt-3 text-theme-xs text-gray-400 dark:text-gray-500">{t("appointments.branch")}</p>
            <h4 className="font-semibold text-gray-800 dark:text-white/90">
              {staffBranch?.name ?? "—"}
            </h4>
          </div>
        ) : (
          <>
            <MetricCard
              icon={<BoxCubeIcon className="text-gray-800 size-6 dark:text-white/90" />}
              label={t("dashboard.clinics")}
              value={String(clinics.length)}
            />
            <MetricCard
              icon={<BoxIconLine className="text-gray-800 size-6 dark:text-white/90" />}
              label={t("dashboard.branches")}
              value={String(branchCount)}
            />
          </>
        )}
        <MetricCard
          icon={<CalenderIcon className="text-gray-800 size-6 dark:text-white/90" />}
          label={t("dashboard.appointmentsToday")}
          value={String(todays.length)}
        />
        <MetricCard
          icon={<DollarLineIcon className="text-gray-800 size-6 dark:text-white/90" />}
          label={t("dashboard.collected")}
          value={formatCurrency(collected, currency)}
        />
      </div>

      {/* Recent appointments */}
      <div className="col-span-12 overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("dashboard.recentAppointments")}
            </h3>
          </div>
          <Link
            href="/appointments"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
          >
            {t("dashboard.seeAll")}
          </Link>
        </div>
        {recent.length === 0 ? (
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
                {recent.map((appt) => (
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

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
        {icon}
      </div>
      <div className="flex items-end justify-between mt-5">
        <div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
          <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
            {value}
          </h4>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
      {message}
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:col-span-7">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[140px] animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"
          />
        ))}
      </div>
      <div className="col-span-12 xl:col-span-5">
        <div className="h-[300px] animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}

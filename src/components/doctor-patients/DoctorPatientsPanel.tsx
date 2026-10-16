"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton, TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import { ApiError, Appointment, BranchDoctor, appointmentsApi, doctorsApi } from "@/lib/api";
import { appointmentStatusColor, formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useLatestRequest } from "@/hooks/useAsyncAction";
import { Avatar, STATUS_KEY, addDaysYmd } from "@/components/dashboard/DashboardWidgets";

const PAGE_SIZE = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Patients booked with one doctor at one branch on one day. Reached from the
 * dashboard's "Upcoming doctors" card, which passes doctor_id, branch_id, date
 * and the doctor/branch names (so the header renders without a lookup).
 */
export default function DoctorPatientsPanel() {
  const { t, locale } = useTranslation();
  const sp = useSearchParams();
  const doctorId = sp.get("doctor_id") ?? "";
  const branchId = sp.get("branch_id") ?? "";
  const nameParam = sp.get("name") ?? "";
  const branchName = sp.get("branch") ?? "";
  const dateParam = sp.get("date") ?? "";
  // Same default as the dashboard card (tomorrow) when no valid date is given.
  const date = DATE_RE.test(dateParam) ? dateParam : addDaysYmd(1);

  const [items, setItems] = useState<Appointment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [doctor, setDoctor] = useState<BranchDoctor | null>(null);
  const { begin, isLatest } = useLatestRequest();

  const params = useMemo(
    () => ({ doctor_id: doctorId, branch_id: branchId || undefined, date_from: date, date_to: date }),
    [doctorId, branchId, date]
  );

  const load = useCallback(async () => {
    const token = begin();
    if (!doctorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setMoreError(null);
    try {
      const res = await appointmentsApi.list({ ...params, limit: PAGE_SIZE });
      if (!isLatest(token)) return;
      setItems(res.items);
      setCursor(res.next_cursor);
    } catch (err) {
      if (!isLatest(token)) return;
      setItems([]);
      setCursor(null);
      setError(err instanceof ApiError ? err.message : t("doctorPatients.loadFailed"));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [doctorId, params, t, begin, isLatest]);

  useEffect(() => {
    load();
  }, [load]);

  // Photo / specialization for the header come from the branch roster. Purely
  // cosmetic: on failure the header keeps the initials and the passed name.
  useEffect(() => {
    if (!branchId || !doctorId) return;
    let cancelled = false;
    doctorsApi
      .listByBranch(branchId)
      .then((res) => {
        if (!cancelled) setDoctor(res.items.find((d) => d.id === doctorId) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [branchId, doctorId]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await appointmentsApi.list({ ...params, limit: PAGE_SIZE, cursor });
      setItems((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...res.items.filter((a) => !seen.has(a.id))];
      });
      setCursor(res.next_cursor);
    } catch (err) {
      setMoreError(err instanceof ApiError ? err.message : t("doctorPatients.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const patientName = (a: Appointment) =>
    a.patient_details?.name || a.patient?.name || t("dashboard.patient");
  const patientPhone = (a: Appointment) => a.patient_details?.phone || a.patient?.mobile || "";

  // Client-side filter over what's loaded — no extra request.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || ""));
    if (!term) return sorted;
    return sorted.filter((a) => {
      const name = (a.patient_details?.name || a.patient?.name || "").toLowerCase();
      const phone = (a.patient_details?.phone || a.patient?.mobile || "").toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
  }, [items, search]);

  const displayName = nameParam || doctor?.name || t("doctorPatients.title");
  const specialization = doctor?.specialization ?? "";
  const dateLabel = (() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale === "bn" ? "bn-IN" : "en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  })();

  if (!doctorId) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <p>{t("doctorPatients.missingDoctor")}</p>
        <Link href="/dashboard" className="mt-3 inline-block font-medium text-brand-500 hover:text-brand-600">
          &larr; {t("doctorPatients.backToDashboard")}
        </Link>
      </div>
    );
  }

  const thCls = "py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={displayName} photoUrl={doctor?.photo_url} size="h-14 w-14" />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-gray-800 dark:text-white/90">{displayName}</h3>
            {specialization && (
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">{specialization}</p>
            )}
            <p className="mt-0.5 text-theme-xs text-gray-400 dark:text-gray-500">
              {[branchName, dateLabel].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
          {loading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            t(items.length === 1 ? "dashboard.doctorPatients" : "dashboard.doctorPatientsPlural", {
              count: items.length,
            }) + (cursor ? "+" : "")
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
          {!loading && (
            <button type="button" onClick={load} className="ml-3 font-medium underline hover:no-underline">
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("doctorPatients.searchPlaceholder")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:max-w-sm"
          />
        </div>

        {!loading && !error && visible.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-gray-50 px-4 text-center text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            {search.trim() ? t("doctorPatients.noMatches") : t("doctorPatients.noPatients")}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-y border-gray-100 dark:border-gray-800">
                <TableRow>
                  <TableCell isHeader className={thCls}>{t("dashboard.patient")}</TableCell>
                  <TableCell isHeader className={thCls}>{t("doctorPatients.phone")}</TableCell>
                  <TableCell isHeader className={thCls}>{t("doctorPatients.time")}</TableCell>
                  <TableCell isHeader className={thCls}>{t("dashboard.fee")}</TableCell>
                  <TableCell isHeader className={thCls}>{t("dashboard.status")}</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <TableRowsSkeleton rows={5} cols={5} cellClassName="py-3" />
                ) : (
                  visible.map((a) => {
                    const phone = patientPhone(a);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={patientName(a)}
                              photoUrl={a.patient_details?.photo_url}
                              size="h-9 w-9"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
                                {patientName(a)}
                              </p>
                              {(a.patient_details?.age != null || a.patient_details?.gender) && (
                                <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                                  {[a.patient_details?.age != null ? `${a.patient_details.age}` : "", a.patient_details?.gender ?? ""]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                          {phone ? (
                            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:text-brand-500">
                              {phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                          {a.scheduled_time?.slice(0, 5) || "—"}
                        </TableCell>
                        <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                          {formatCurrency(a.fee_amount, a.currency)}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge size="sm" color={appointmentStatusColor(a.status)}>
                            {t(`status.${STATUS_KEY[a.status] ?? a.status}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && cursor && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {moreError && <p className="text-sm text-error-600 dark:text-error-400">{moreError}</p>}
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            >
              {loadingMore ? t("common.loading") : t("doctorPatients.loadMore")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

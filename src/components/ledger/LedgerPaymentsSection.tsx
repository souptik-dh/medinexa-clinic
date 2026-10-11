"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { StatGridSkeleton, TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import { Appointment, ApiError, ledgerApi } from "@/lib/api";
import { appointmentStatusColor, formatCurrency, formatDateTime } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useLatestRequest } from "@/hooks/useAsyncAction";

const PAGE_SIZE = 20;

type MethodFilter = "all" | "cash" | "upi" | "card" | "other";
type StatusFilter = "all" | "paid" | "completed";

/** Methods with their own tile; anything else (net banking, online…) counts as "other". */
const MAIN_METHODS = ["cash", "upi", "card"] as const;

const METHOD_TILES: { value: MethodFilter; labelKey: string; tone: string; activeRing: string }[] = [
  {
    value: "all",
    labelKey: "ledger.totalCollected",
    tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
    activeRing: "border-brand-500 ring-2 ring-brand-500/20",
  },
  {
    value: "cash",
    labelKey: "ledger.cash",
    tone: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400",
    activeRing: "border-success-500 ring-2 ring-success-500/20",
  },
  {
    value: "upi",
    labelKey: "ledger.upi",
    tone: "bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/10 dark:text-blue-light-400",
    activeRing: "border-blue-light-500 ring-2 ring-blue-light-500/20",
  },
  {
    value: "card",
    labelKey: "ledger.card",
    tone: "bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-orange-400",
    activeRing: "border-warning-500 ring-2 ring-warning-500/20",
  },
  {
    value: "other",
    labelKey: "ledger.other",
    tone: "bg-gray-100 text-gray-600 dark:bg-white/[0.05] dark:text-gray-300",
    activeRing: "border-gray-500 ring-2 ring-gray-500/20",
  },
];

const METHOD_LABEL_KEYS: Record<string, string> = {
  cash: "ledger.cash",
  upi: "ledger.upi",
  card: "ledger.card",
  net_banking: "ledger.netBanking",
  online: "ledger.online",
};

interface PaymentEntry {
  id: string;
  patient: string;
  doctor: string;
  branch: string;
  date: string;
  time: string;
  method: string;
  reference: string | null;
  amount: number;
  currency: string;
  status: "paid" | "completed";
  paidAt: string | null;
}

function methodGroup(method: string): Exclude<MethodFilter, "all"> {
  return (MAIN_METHODS as readonly string[]).includes(method)
    ? (method as "cash" | "upi" | "card")
    : "other";
}

function toEntry(a: Appointment): PaymentEntry {
  // The list endpoint doesn't expose a payment reference today; pick it up if it ever does.
  const reference = (a as Appointment & { payment_reference?: string | null }).payment_reference ?? null;
  return {
    id: a.id,
    patient: a.patient_details?.name || a.patient?.name || a.patient_id,
    doctor: a.doctor_name || a.doctor_id,
    branch: a.branch_name || "—",
    date: a.scheduled_date,
    time: a.scheduled_time,
    method: a.payment_method || "cash",
    reference,
    amount: Number(a.fee_amount) || 0,
    currency: a.currency || "INR",
    status: a.status === "completed" ? "completed" : "paid",
    paidAt: a.paid_at ?? null,
  };
}

/** "2026-10-01" → "01 Oct 2026" without UTC drift. */
function formatYmd(ymd: string): string {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return ymd || "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "07:00[:00]" → "7:00 am". */
function formatHm(hm: string): string {
  const [h, m] = (hm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm || "—";
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function LedgerPaymentsSection({ clinicId }: { clinicId: string }) {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentEntry | null>(null);
  const { isOpen, openModal, closeModal } = useModal();
  const { begin, isLatest } = useLatestRequest();

  const load = useCallback(async () => {
    const token = begin();
    if (!clinicId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setEntries([]);
    setError(null);
    try {
      const items = await ledgerApi.listPayments({
        clinic_id: clinicId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      if (!isLatest(token)) return;
      setEntries(items.map(toEntry));
      setVisible(PAGE_SIZE);
    } catch (err) {
      if (!isLatest(token)) return;
      setError(err instanceof ApiError ? err.message : t("ledger.failedToLoadPayments"));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [clinicId, dateFrom, dateTo, t, begin, isLatest]);

  useEffect(() => {
    load();
  }, [load]);

  // Entries matching the status filter — what the method tiles summarise.
  const statusEntries = useMemo(
    () => entries.filter((e) => statusFilter === "all" || e.status === statusFilter),
    [entries, statusFilter]
  );
  // statusEntries narrowed by the method filter — the list.
  const filtered = useMemo(
    () => statusEntries.filter((e) => methodFilter === "all" || methodGroup(e.method) === methodFilter),
    [statusEntries, methodFilter]
  );
  const totals = useMemo(() => {
    const acc: Record<MethodFilter, { amount: number; count: number }> = {
      all: { amount: 0, count: 0 },
      cash: { amount: 0, count: 0 },
      upi: { amount: 0, count: 0 },
      card: { amount: 0, count: 0 },
      other: { amount: 0, count: 0 },
    };
    for (const e of statusEntries) {
      for (const key of ["all", methodGroup(e.method)] as const) {
        acc[key].amount += e.amount;
        acc[key].count += 1;
      }
    }
    return acc;
  }, [statusEntries]);
  const listTotal = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);
  const currency = entries[0]?.currency ?? "INR";
  const shown = filtered.slice(0, visible);

  const changeStatus = (s: StatusFilter) => {
    setStatusFilter(s);
    setVisible(PAGE_SIZE);
  };
  const changeMethod = (m: MethodFilter) => {
    // Clicking the active tile again goes back to all methods.
    setMethodFilter((prev) => (prev === m ? "all" : m));
    setVisible(PAGE_SIZE);
  };
  const share = (m: MethodFilter) =>
    totals.all.amount ? Math.round((totals[m].amount / totals.all.amount) * 100) : 0;
  const methodLabel = (method: string) => t(METHOD_LABEL_KEYS[method] ?? "ledger.other");
  const statusLabel = (s: PaymentEntry["status"]) =>
    s === "completed" ? t("ledger.statusCompleted") : t("ledger.statusPaid");

  const openDetail = (entry: PaymentEntry) => {
    setSelected(entry);
    openModal();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:flex-wrap sm:items-end sm:p-6">
        <div className="sm:w-44">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("ledger.dateFrom")}
          </label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:w-44">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("ledger.dateTo")}
          </label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputClass}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("ledger.clearDates")}
          </button>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {(["all", "paid", "completed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeStatus(s)}
              aria-pressed={statusFilter === s}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                statusFilter === s
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.08]"
              }`}
            >
              {s === "all"
                ? t("ledger.statusAll")
                : s === "paid"
                  ? t("ledger.statusPaid")
                  : t("ledger.statusCompleted")}
            </button>
          ))}
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

      {/* Method tiles */}
      {loading ? (
        <StatGridSkeleton count={5} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" />
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {METHOD_TILES.map((tile) => {
              const active = methodFilter === tile.value;
              return (
                <button
                  key={tile.value}
                  type="button"
                  onClick={() => changeMethod(tile.value)}
                  aria-pressed={active}
                  className={`rounded-2xl border bg-white p-4 text-left transition hover:border-gray-300 dark:bg-white/[0.03] dark:hover:border-gray-700 ${
                    active ? tile.activeRing : "border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${tile.tone}`}>
                    {t(tile.labelKey)}
                  </span>
                  <p className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                    {formatCurrency(totals[tile.value].amount, currency)}
                  </p>
                  <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                    {t("ledger.paymentsCount", { count: totals[tile.value].count })}
                    {tile.value !== "all" && ` · ${t("ledger.shareOfTotal", { value: share(tile.value) })}`}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-theme-xs text-gray-400 dark:text-gray-500">{t("ledger.methodFilterHint")}</p>
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {!loading && filtered.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{t("ledger.showingCount", { shown: shown.length, total: filtered.length })}</span>
            <span className="font-medium text-gray-800 dark:text-white/90">
              {t("ledger.filteredTotal", { amount: formatCurrency(listTotal, currency) })}
            </span>
          </div>
        )}
        {!loading && filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("ledger.noPaymentsInRange")}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  {[
                    t("ledger.patient"),
                    t("ledger.doctor"),
                    t("ledger.branch"),
                    t("ledger.date"),
                    t("ledger.method"),
                    t("ledger.amount"),
                    t("ledger.status"),
                  ].map((label) => (
                    <TableCell
                      key={label}
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      {label}
                    </TableCell>
                  ))}
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    {" "}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <TableRowsSkeleton rows={6} cols={8} cellClassName="py-3" />
                ) : (
                  shown.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="py-3">
                        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{e.patient}</p>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">{e.doctor}</TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">{e.branch}</TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        <p>{formatYmd(e.date)}</p>
                        <span className="text-theme-xs">{formatHm(e.time)}</span>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {methodLabel(e.method)}
                      </TableCell>
                      <TableCell className="py-3 font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {formatCurrency(e.amount, e.currency)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color={appointmentStatusColor(e.status)}>
                          {statusLabel(e.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => openDetail(e)}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                          >
                            {t("ledger.view")}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && visible < filtered.length && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("ledger.loadMore")}
            </button>
          </div>
        )}
      </div>

      {/* Entry detail */}
      <Modal isOpen={isOpen && !!selected} onClose={closeModal} className="max-w-[520px] p-6 lg:p-8">
        {selected && (
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("ledger.paymentDetails")}
            </h5>
            <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-white/90">
              {formatCurrency(selected.amount, selected.currency)}
            </p>
            <dl className="mt-5 divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {(
                [
                  [t("ledger.patient"), selected.patient],
                  [t("ledger.doctor"), selected.doctor],
                  [t("ledger.branch"), selected.branch],
                  [t("ledger.date"), formatYmd(selected.date)],
                  [t("ledger.time"), formatHm(selected.time)],
                  [t("ledger.method"), methodLabel(selected.method)],
                  [t("ledger.reference"), selected.reference || "—"],
                  [t("ledger.collectedAt"), selected.paidAt ? formatDateTime(selected.paidAt) : "—"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="text-right font-medium text-gray-800 dark:text-white/90">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">{t("ledger.status")}</dt>
                <dd>
                  <Badge size="sm" color={appointmentStatusColor(selected.status)}>
                    {statusLabel(selected.status)}
                  </Badge>
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("ledger.close")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

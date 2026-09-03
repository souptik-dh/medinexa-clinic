"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import Pagination from "@/components/tables/Pagination";
import { useModal } from "@/hooks/useModal";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import { TableSkeleton, DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import BookAppointmentModal from "@/components/appointments/BookAppointmentModal";
import ReceiptsModal from "@/components/receipts/ReceiptsModal";
import {
  Appointment,
  AppointmentDetail,
  AppointmentStatus,
  ApiError,
  StatusHistoryEntry,
  appointmentsApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  formatCurrency,
  relationshipLabel,
  today,
} from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

type Action = "confirm" | "pay" | "complete" | "cancel";

const STATUS_FILTERS: (AppointmentStatus | "")[] = [
  "",
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
  "no_show",
];

export default function AppointmentsPanel() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [items, setItems] = useState<Appointment[]>([]);
  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [active, setActive] = useState<Appointment | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  // payment form
  const [feeAmount, setFeeAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [reason, setReason] = useState("");

  const [history, setHistory] = useState<StatusHistoryEntry[] | null>(null);

  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [showBookModal, setShowBookModal] = useState(false);
  const [receiptsFor, setReceiptsFor] = useState<Appointment | null>(null);

  const { isOpen, openModal, closeModal } = useModal();
  const { page, setPage, totalPages, pageItems } = usePagination(items, {
    resetKey: `${status}-${dateFrom}-${dateTo}`,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await appointmentsApi.list({
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 50,
      });
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, t("appointments.failedToLoadAppointments")));
    } finally {
      setLoading(false);
    }
  }, [status, dateFrom, dateTo, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openAction = (appt: Appointment, a: Action) => {
    setActive(appt);
    setAction(a);
    setFeeAmount(String(appt.fee_amount ?? ""));
    setReferenceNo("");
    setReason("");
    setHistory(null);
    setDetail(null);
    setShowDetail(false);
    openModal();
  };

  const ACTION_PERMISSION: Record<Action, Parameters<typeof can>[0]> = {
    confirm: "appointments:confirm",
    pay: "appointments:payment",
    complete: "appointments:complete",
    cancel: "appointments:cancel",
  };

  const ACTION_SUCCESS_MESSAGE: Record<Action, string> = {
    confirm: t("appointments.confirmSuccess"),
    pay: t("appointments.paySuccess"),
    complete: t("appointments.completeSuccess"),
    cancel: t("appointments.cancelSuccess"),
  };

  const runAction = async () => {
    if (!active || !action) return;
    if (!can(ACTION_PERMISSION[action])) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "confirm") {
        await appointmentsApi.confirm(active.id);
      } else if (action === "complete") {
        await appointmentsApi.complete(active.id);
      } else if (action === "pay") {
        const amount = Number(feeAmount);
        if (!amount || amount <= 0) {
          throw new ApiError(t("appointments.invalidFeeAmount"), "VALIDATION_ERROR", 400);
        }
        await appointmentsApi.pay(
          active.id,
          { fee_amount: amount, method, reference_no: referenceNo || null },
          crypto.randomUUID()
        );
      } else if (action === "cancel") {
        await appointmentsApi.cancel(active.id, reason || "Cancelled from dashboard");
      }
      closeModal();
      await load();
      toast.success(ACTION_SUCCESS_MESSAGE[action]);
    } catch (err) {
      const message = getErrorMessage(err, t("appointments.actionFailed"));
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const showHistory = async (appt: Appointment) => {
    try {
      const res = await appointmentsApi.statusHistory(appt.id);
      setActive(appt);
      setAction(null);
      setDetail(null);
      setShowDetail(false);
      setHistory(res.items);
      openModal();
    } catch {
      // ignore
    }
  };

  const viewDetail = async (appt: Appointment) => {
    setActive(appt);
    setAction(null);
    setHistory(null);
    setDetail(null);
    setShowDetail(true);
    setDetailError(null);
    setDetailLoading(true);
    openModal();
    try {
      const full = await appointmentsApi.get(appt.id);
      setDetail(full);
    } catch (err) {
      setDetailError(getErrorMessage(err, t("appointments.failedToLoadAppointment")));
    } finally {
      setDetailLoading(false);
    }
  };

  const canConfirm = (a: Appointment) => a.status === "pending";
  // Paid/completed only makes sense once the appointment has actually happened —
  // not while it's still scheduled for a future date.
  const canPay = (a: Appointment) => a.status === "confirmed" && a.scheduled_date <= today();
  const canComplete = (a: Appointment) => a.status === "paid" && a.scheduled_date <= today();
  const canCancel = (a: Appointment) =>
    a.status === "pending" || a.status === "confirmed" || a.status === "paid";
  const canViewReceipts = (a: Appointment) =>
    a.status === "confirmed" || a.status === "paid" || a.status === "completed";

  return (
    <div>
      {/* Book-on-behalf action */}
      {can("appointments:create") && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowBookModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("appointments.bookForPatient")}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
        <FilterField label={t("dashboard.status")}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AppointmentStatus | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || "all"} value={s}>
                {s === "" ? t("appointments.allStatuses") : appointmentStatusLabel(s, t)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("appointments.from")}>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </FilterField>
        <FilterField label={t("appointments.to")}>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </FilterField>
        <button
          onClick={load}
          className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t("appointments.refresh")}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("appointments.noAppointmentsMatch")}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.scheduled")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.patient")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.doctor")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("appointments.branch")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.fee")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.status")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    {t("appointments.actions")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pageItems.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {appt.scheduled_date}
                      </p>
                      <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                        {appt.scheduled_time} · {appt.duration_minutes}m
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <p className="text-gray-800 text-theme-sm dark:text-white/90">
                        {appt.patient_details?.name ?? "—"}
                      </p>
                      {appt.patient_details && appt.patient_details.relationship !== "self" && (
                        <Badge size="sm" color="light">
                          {relationshipLabel(appt.patient_details.relationship, t)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {appt.doctor_name ?? shortId(appt.doctor_id)}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {appt.branch_name ?? shortId(appt.branch_id)}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatCurrency(appt.fee_amount, appt.currency)}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge size="sm" color={appointmentStatusColor(appt.status)}>
                        {appointmentStatusLabel(appt.status, t)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewDetail(appt)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          title={t("appointments.view")}
                        >
                          {t("appointments.view")}
                        </button>
                        {canConfirm(appt) && can("appointments:confirm") && (
                          <ActionButton label={t("appointments.confirm")} color="brand" onClick={() => openAction(appt, "confirm")} />
                        )}
                        {canPay(appt) && can("appointments:payment") && (
                          <ActionButton label={t("appointments.pay")} color="brand" onClick={() => openAction(appt, "pay")} />
                        )}
                        {canComplete(appt) && can("appointments:complete") && (
                          <ActionButton label={t("appointments.complete")} color="success" onClick={() => openAction(appt, "complete")} />
                        )}
                        {canCancel(appt) && can("appointments:cancel") && (
                          <ActionButton label={t("appointments.cancel")} color="error" onClick={() => openAction(appt, "cancel")} />
                        )}
                        {canViewReceipts(appt) && (
                          <button
                            onClick={() => setReceiptsFor(appt)}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          >
                            {t("receipts.viewReceipts")}
                          </button>
                        )}
                        <button
                          onClick={() => showHistory(appt)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          title={t("appointments.statusHistory")}
                        >
                          {t("appointments.history")}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {items.length > 10 && (
          <div className="mt-4 flex justify-center">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Action modal */}
      <Modal isOpen={isOpen && !!action} onClose={closeModal} className="max-w-[500px] p-6 lg:p-8">
        {active && action && (
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {t(`appointments.${action}Appointment`)}
            </h5>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {active.scheduled_date} at {active.scheduled_time} ·{" "}
              {formatCurrency(active.fee_amount, active.currency)}
            </p>

            {action === "pay" && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("appointments.feeAmount")}
                  </label>
                  <input
                    type="number"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("appointments.method")}
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as "cash" | "upi")}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="cash">{t("appointments.cash")}</option>
                    <option value="upi">{t("appointments.upi")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("appointments.referenceNoOptional")}
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>
            )}

            {action === "cancel" && (
              <div className="mt-6">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("appointments.cancellationReason")}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
            )}

            {action !== "pay" && action !== "cancel" && (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                {action === "confirm" && t("appointments.markConfirmed")}
                {action === "complete" && t("appointments.markCompleted")}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("appointments.close")}
              </button>
              <button
                onClick={runAction}
                disabled={busy}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {busy ? t("appointments.working") : t(`appointments.${action}`)}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal isOpen={isOpen && !!history} onClose={closeModal} className="max-w-[560px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("appointments.statusHistory")}
        </h5>
        <div className="mt-5 space-y-3">
          {history?.map((h, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-800"
            >
              <div>
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {h.from_status ?? "—"} → {h.to_status}
                </p>
                <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                  {new Date(h.changed_at).toLocaleString()}
                </p>
                {h.note && (
                  <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    {h.note}
                  </p>
                )}
              </div>
              <span className="text-theme-xs text-gray-400 dark:text-gray-500">
                {shortId(h.changed_by)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={closeModal}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("appointments.close")}
          </button>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal
        isOpen={isOpen && showDetail}
        onClose={closeModal}
        className="max-w-[560px] p-6 lg:p-8"
      >
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("appointments.appointmentDetails")}
        </h5>

        {detailLoading ? (
          <DetailSkeleton rows={4} />
        ) : detailError ? (
          <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {detailError}
          </div>
        ) : detail ? (
          <div className="mt-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {detail.scheduled_date} at {detail.scheduled_time} · {detail.duration_minutes}m
                </p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {formatCurrency(detail.fee_amount, detail.currency)}
                  {detail.payment_method ? ` · ${detail.payment_method}` : ""}
                </p>
              </div>
              <Badge size="sm" color={appointmentStatusColor(detail.status)}>
                {appointmentStatusLabel(detail.status, t)}
              </Badge>
            </div>

            <dl className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <DetailRow
                label={t("dashboard.doctor")}
                value={detail.doctor_name ?? active?.doctor_name ?? shortId(detail.doctor_id)}
              />
              <DetailRow
                label={t("appointments.branch")}
                value={detail.branch_name ?? active?.branch_name ?? shortId(detail.branch_id)}
              />
            </dl>

            {detail.patient_details && detail.patient_details.relationship !== "self" && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("appointments.visitingPatient")}</h6>
                  <Badge size="sm" color="light">
                    {relationshipLabel(detail.patient_details.relationship, t)}
                  </Badge>
                </div>
                <dl className="mt-2 space-y-2">
                  <DetailRow label={t("appointments.name")} value={detail.patient_details.name} />
                  <DetailRow label={t("appointments.phone")} value={detail.patient_details.phone ?? "—"} />
                  {detail.patient_details.age != null && (
                    <DetailRow label={t("appointments.age")} value={String(detail.patient_details.age)} />
                  )}
                  {detail.patient_details.gender && (
                    <DetailRow label={t("appointments.gender")} value={detail.patient_details.gender} />
                  )}
                </dl>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {detail.patient_details && detail.patient_details.relationship !== "self" ? t("appointments.bookedBy") : t("appointments.patient")}
              </h6>
              <dl className="mt-2 space-y-2">
                <DetailRow label={t("appointments.name")} value={detail.patient.name} />
                <DetailRow label={t("appointments.email")} value={detail.patient.email} />
                <DetailRow label={t("appointments.phone")} value={detail.patient.phone ?? "—"} />
                <DetailRow label={t("appointments.address")} value={detail.patient.address ?? "—"} />
              </dl>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            onClick={closeModal}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("appointments.close")}
          </button>
        </div>
      </Modal>

      {/* Book-on-behalf modal */}
      <BookAppointmentModal
        isOpen={showBookModal}
        onClose={() => setShowBookModal(false)}
        onBooked={load}
      />

      <ReceiptsModal
        isOpen={!!receiptsFor}
        onClose={() => setReceiptsFor(null)}
        kind="appointment"
        appointmentId={receiptsFor?.id ?? null}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:w-48">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function ActionButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: "brand" | "success" | "error";
  onClick: () => void;
}) {
  const colorClass = {
    brand: "text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10",
    success: "text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10",
    error: "text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10",
  }[color];
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2 py-1.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </button>
  );
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

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
import TruckLoader from "@/components/common/TruckLoader";
import BookAppointmentModal from "@/components/appointments/BookAppointmentModal";
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
      setError(getErrorMessage(err, "Failed to load appointments"));
    } finally {
      setLoading(false);
    }
  }, [status, dateFrom, dateTo]);

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
    confirm: "Appointment confirmed successfully.",
    pay: "Payment recorded successfully.",
    complete: "Appointment marked as completed successfully.",
    cancel: "Appointment cancelled successfully.",
  };

  const runAction = async () => {
    if (!active || !action) return;
    if (!can(ACTION_PERMISSION[action])) {
      toast.error("You do not have permission to perform this action.");
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
          throw new ApiError("Please enter a valid fee amount", "VALIDATION_ERROR", 400);
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
      const message = getErrorMessage(err, "Unable to complete this action. Please try again.");
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
      setDetailError(getErrorMessage(err, "Failed to load appointment"));
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
            Book for patient
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
        <FilterField label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AppointmentStatus | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || "all"} value={s}>
                {s === "" ? "All statuses" : appointmentStatusLabel(s)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </FilterField>
        <FilterField label="To">
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
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {loading ? (
          <TruckLoader label="Loading appointments…" />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No appointments match the current filters.
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Scheduled
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Patient
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Doctor
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Branch
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Fee
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Status
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    Actions
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
                          {relationshipLabel(appt.patient_details.relationship)}
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
                        {appointmentStatusLabel(appt.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewDetail(appt)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          title="View details"
                        >
                          View
                        </button>
                        {canConfirm(appt) && can("appointments:confirm") && (
                          <ActionButton label="Confirm" color="brand" onClick={() => openAction(appt, "confirm")} />
                        )}
                        {canPay(appt) && can("appointments:payment") && (
                          <ActionButton label="Pay" color="brand" onClick={() => openAction(appt, "pay")} />
                        )}
                        {canComplete(appt) && can("appointments:complete") && (
                          <ActionButton label="Complete" color="success" onClick={() => openAction(appt, "complete")} />
                        )}
                        {canCancel(appt) && can("appointments:cancel") && (
                          <ActionButton label="Cancel" color="error" onClick={() => openAction(appt, "cancel")} />
                        )}
                        <button
                          onClick={() => showHistory(appt)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          title="Status history"
                        >
                          History
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
              {actionLabel(action)} appointment
            </h5>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {active.scheduled_date} at {active.scheduled_time} ·{" "}
              {formatCurrency(active.fee_amount, active.currency)}
            </p>

            {action === "pay" && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Fee amount
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
                    Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as "cash" | "upi")}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Reference no (optional)
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
                  Cancellation reason
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
                {action === "confirm" &&
                  "Mark this appointment as confirmed. Requires status 'pending'."}
                {action === "complete" &&
                  "Mark this appointment as completed. Requires status 'paid'."}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Close
              </button>
              <button
                onClick={runAction}
                disabled={busy}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {busy ? "Working…" : actionLabel(action)}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal isOpen={isOpen && !!history} onClose={closeModal} className="max-w-[560px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Status history
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
            Close
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
          Appointment details
        </h5>

        {detailLoading ? (
          <TruckLoader label="Loading…" />
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
                {appointmentStatusLabel(detail.status)}
              </Badge>
            </div>

            <dl className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <DetailRow
                label="Doctor"
                value={detail.doctor_name ?? active?.doctor_name ?? shortId(detail.doctor_id)}
              />
              <DetailRow
                label="Branch"
                value={detail.branch_name ?? active?.branch_name ?? shortId(detail.branch_id)}
              />
            </dl>

            {detail.patient_details && detail.patient_details.relationship !== "self" && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Visiting patient</h6>
                  <Badge size="sm" color="light">
                    {relationshipLabel(detail.patient_details.relationship)}
                  </Badge>
                </div>
                <dl className="mt-2 space-y-2">
                  <DetailRow label="Name" value={detail.patient_details.name} />
                  <DetailRow label="Phone" value={detail.patient_details.phone ?? "—"} />
                  {detail.patient_details.age != null && (
                    <DetailRow label="Age" value={String(detail.patient_details.age)} />
                  )}
                  {detail.patient_details.gender && (
                    <DetailRow label="Gender" value={detail.patient_details.gender} />
                  )}
                </dl>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {detail.patient_details && detail.patient_details.relationship !== "self" ? "Booked by" : "Patient"}
              </h6>
              <dl className="mt-2 space-y-2">
                <DetailRow label="Name" value={detail.patient.name} />
                <DetailRow label="Email" value={detail.patient.email} />
                <DetailRow label="Phone" value={detail.patient.phone ?? "—"} />
                <DetailRow label="Address" value={detail.patient.address ?? "—"} />
              </dl>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            onClick={closeModal}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Book-on-behalf modal */}
      <BookAppointmentModal
        isOpen={showBookModal}
        onClose={() => setShowBookModal(false)}
        onBooked={load}
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

function actionLabel(action: Action): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
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

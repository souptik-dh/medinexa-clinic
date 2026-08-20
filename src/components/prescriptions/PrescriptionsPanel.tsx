"use client";
import React, { useCallback, useEffect, useState } from "react";
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
import TruckLoader from "@/components/common/TruckLoader";
import {
  ApiError,
  Appointment,
  AppointmentStatus,
  Prescription,
  appointmentsApi,
  prescriptionsApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  downloadBlob,
  formatCurrency,
  formatDateTime,
} from "@/lib/utils";

const STATUS_FILTERS: (AppointmentStatus | "")[] = [
  "",
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
];

export default function PrescriptionsPanel() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [active, setActive] = useState<Appointment | null>(null);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);
  const { isOpen, openModal, closeModal } = useModal();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await appointmentsApi.list({
        status: status || undefined,
        limit: 50,
      });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const viewPrescription = async (appt: Appointment) => {
    setActive(appt);
    setPrescription(null);
    setPrescriptionError(null);
    openModal();
    try {
      const res = await prescriptionsApi.get(appt.id);
      setPrescription(res);
    } catch (err) {
      setPrescriptionError(
        err instanceof ApiError ? err.message : "Failed to load prescription"
      );
    }
  };

  const downloadPdf = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await prescriptionsApi.pdf(active.id);
      downloadBlob(blob, `prescription-${active.id.slice(0, 8)}.pdf`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
        <div className="sm:w-48">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Status
          </label>
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
        </div>
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
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          Prescriptions
        </h3>
        {loading ? (
          <TruckLoader label="Loading prescriptions…" />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No appointments match the current filter.
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
                    Doctor
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
                {items.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {appt.scheduled_date}
                      </p>
                      <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                        {appt.scheduled_time}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {shortId(appt.doctor_id)}
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
                      <div className="flex justify-end">
                        <button
                          onClick={() => viewPrescription(appt)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                        >
                          View
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Prescription modal */}
      <Modal isOpen={isOpen && !!active} onClose={closeModal} className="max-w-[600px] p-6 lg:p-8">
        {active && (
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Prescription
            </h5>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {active.scheduled_date} at {active.scheduled_time} ·{" "}
              {formatCurrency(active.fee_amount, active.currency)}
            </p>

            <div className="mt-6">
              {prescriptionError ? (
                <p className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  {prescriptionError}
                </p>
              ) : !prescription ? (
                <TruckLoader label="Loading…" />
              ) : (
                <div className="space-y-4">
                  {prescription.scan_url && (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-400">
                        Scan
                      </p>
                      <a
                        href={prescription.scan_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-500 underline hover:text-brand-600"
                      >
                        Open scan image
                      </a>
                    </div>
                  )}
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-400">
                      Digitized text
                    </p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                      {prescription.digitized_text ??
                        "Text is redacted for staff and clinic owners. Only the prescribing doctor and the patient see the digitized text."}
                    </pre>
                  </div>
                  <p className="text-theme-xs text-gray-400 dark:text-gray-500">
                    Finalized {formatDateTime(prescription.finalized_at)}
                    {prescription.ocr_confidence !== null &&
                      ` · OCR confidence ${prescription.ocr_confidence}%`}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Close
              </button>
              <button
                onClick={downloadPdf}
                disabled={busy || !!prescriptionError}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {busy ? "Downloading…" : "Download PDF"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

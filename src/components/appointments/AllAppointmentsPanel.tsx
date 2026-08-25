"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  Branch,
  LabTestAppointment,
  LabTestAppointmentStatus,
  appointmentsApi,
  labTestAppointmentsApi,
  branchesApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  labTestAppointmentStatusColor,
  labTestAppointmentStatusLabel,
  labTestPaymentStatusColor,
  labTestPaymentStatusLabel,
  formatCurrency,
  relationshipLabel,
  today,
} from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

type DoctorAction = "confirm" | "pay" | "complete" | "cancel";

const DOCTOR_STATUS_FILTERS: (AppointmentStatus | "")[] = [
  "",
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
  "no_show",
];

const LAB_STATUS_FILTERS: (LabTestAppointmentStatus | "")[] = [
  "",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "CANCELLED",
];

export default function AllAppointmentsPanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<"doctor" | "lab">("doctor");
  const [branches, setBranches] = useState<Branch[]>([]);

  // Doctor appointments state
  const [docItems, setDocItems] = useState<Appointment[]>([]);
  const [docStatus, setDocStatus] = useState<AppointmentStatus | "">("");
  const [docDateFrom, setDocDateFrom] = useState("");
  const [docDateTo, setDocDateTo] = useState("");
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);

  // Doctor action modal state
  const [activeDoc, setActiveDoc] = useState<Appointment | null>(null);
  const [docAction, setDocAction] = useState<DoctorAction | null>(null);
  const [docBusy, setDocBusy] = useState(false);
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
  const {
    page: docPage,
    setPage: setDocPage,
    totalPages: docTotalPages,
    pageItems: docPageItems,
  } = usePagination(docItems, { resetKey: `${docStatus}-${docDateFrom}-${docDateTo}` });

  // Lab appointments state
  const [labItems, setLabItems] = useState<LabTestAppointment[]>([]);
  const [labBranch, setLabBranch] = useState("");
  const [labStatus, setLabStatus] = useState<LabTestAppointmentStatus | "">("");
  const [labSearch, setLabSearch] = useState("");
  const [labDateFrom, setLabDateFrom] = useState("");
  const [labDateTo, setLabDateTo] = useState("");
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const {
    page: labPage,
    setPage: setLabPage,
    totalPages: labTotalPages,
    pageItems: labPageItems,
  } = usePagination(labItems, {
    resetKey: `${labBranch}-${labStatus}-${labSearch}-${labDateFrom}-${labDateTo}`,
  });

  // Load branches for filters
  useEffect(() => {
    if (clinicId) {
      branchesApi.list(clinicId).then((res) => setBranches(res.items)).catch(() => {});
    }
  }, [clinicId]);

  // ---- Doctor Appointments ----
  const loadDoctor = useCallback(async () => {
    setDocLoading(true);
    setDocError(null);
    try {
      const res = await appointmentsApi.list({
        clinic_id: clinicId,
        status: docStatus || undefined,
        date_from: docDateFrom || undefined,
        date_to: docDateTo || undefined,
        limit: 50,
      });
      setDocItems(res.items);
    } catch (err) {
      setDocError(getErrorMessage(err, "Failed to load appointments"));
    } finally {
      setDocLoading(false);
    }
  }, [clinicId, docStatus, docDateFrom, docDateTo]);

  useEffect(() => {
    if (activeTab === "doctor") loadDoctor();
  }, [activeTab, loadDoctor]);

  const openDocAction = (appt: Appointment, a: DoctorAction) => {
    setActiveDoc(appt);
    setDocAction(a);
    setFeeAmount(String(appt.fee_amount ?? ""));
    setReferenceNo("");
    setReason("");
    setHistory(null);
    setDetail(null);
    setShowDetail(false);
    openModal();
  };

  const ACTION_PERMISSION: Record<DoctorAction, Parameters<typeof can>[0]> = {
    confirm: "appointments:confirm",
    pay: "appointments:payment",
    complete: "appointments:complete",
    cancel: "appointments:cancel",
  };

  const ACTION_SUCCESS: Record<DoctorAction, string> = {
    confirm: "Appointment confirmed.",
    pay: "Payment recorded.",
    complete: "Appointment completed.",
    cancel: "Appointment cancelled.",
  };

  const runDocAction = async () => {
    if (!activeDoc || !docAction) return;
    if (!can(ACTION_PERMISSION[docAction])) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    if (docBusy) return;
    setDocBusy(true);
    setDocError(null);
    try {
      if (docAction === "confirm") {
        await appointmentsApi.confirm(activeDoc.id);
      } else if (docAction === "complete") {
        await appointmentsApi.complete(activeDoc.id);
      } else if (docAction === "pay") {
        const amount = Number(feeAmount);
        if (!amount || amount <= 0) {
          throw new ApiError("Please enter a valid fee amount", "VALIDATION_ERROR", 400);
        }
        await appointmentsApi.pay(
          activeDoc.id,
          { fee_amount: amount, method, reference_no: referenceNo || null },
          crypto.randomUUID()
        );
      } else if (docAction === "cancel") {
        await appointmentsApi.cancel(activeDoc.id, reason || "Cancelled from dashboard");
      }
      closeModal();
      await loadDoctor();
      toast.success(ACTION_SUCCESS[docAction]);
    } catch (err) {
      const message = getErrorMessage(err, "Unable to complete this action.");
      setDocError(message);
      toast.error(message);
    } finally {
      setDocBusy(false);
    }
  };

  const showDocHistory = async (appt: Appointment) => {
    try {
      const res = await appointmentsApi.statusHistory(appt.id);
      setActiveDoc(appt);
      setDocAction(null);
      setDetail(null);
      setShowDetail(false);
      setHistory(res.items);
      openModal();
    } catch { /* ignore */ }
  };

  const viewDocDetail = async (appt: Appointment) => {
    setActiveDoc(appt);
    setDocAction(null);
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
  const canPay = (a: Appointment) => a.status === "confirmed" && a.scheduled_date <= today();
  const canComplete = (a: Appointment) => a.status === "paid" && a.scheduled_date <= today();
  const canCancel = (a: Appointment) =>
    a.status === "pending" || a.status === "confirmed" || a.status === "paid";

  // ---- Lab Appointments ----
  const loadLab = useCallback(async () => {
    setLabLoading(true);
    setLabError(null);
    try {
      const res = await labTestAppointmentsApi.list({
        branch_id: labBranch || undefined,
        status: labStatus || undefined,
        patient_name: labSearch || undefined,
        date_from: labDateFrom || undefined,
        date_to: labDateTo || undefined,
        limit: 50,
      });
      setLabItems(res.items);
    } catch (err) {
      setLabError(getErrorMessage(err, "Failed to load lab appointments"));
    } finally {
      setLabLoading(false);
    }
  }, [labBranch, labStatus, labSearch, labDateFrom, labDateTo]);

  useEffect(() => {
    if (activeTab === "lab") loadLab();
  }, [activeTab, loadLab]);

  const handleLabComplete = async (id: string) => {
    setCompletingId(id);
    try {
      await labTestAppointmentsApi.complete(id);
      toast.success("Lab appointment completed.");
      await loadLab();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to complete appointment"));
    } finally {
      setCompletingId(null);
    }
  };

  const canLabApprove = (a: LabTestAppointment) => a.status === "PENDING";
  const canLabReject = (a: LabTestAppointment) => a.status === "PENDING";
  const canLabComplete = (a: LabTestAppointment) => a.status === "APPROVED";
  const canLabCancel = (a: LabTestAppointment) => a.status === "PENDING" || a.status === "APPROVED";
  const canLabPay = (a: LabTestAppointment) =>
    a.payment_method === "PAY_AT_CLINIC" &&
    (a.payment_status === "UNPAID" || a.payment_status === "PENDING") &&
    (a.status === "APPROVED" || a.status === "COMPLETED");

  return (
    <div>
      {/* Header actions */}
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

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-white/[0.03] no-scrollbar">
        <button
          onClick={() => setActiveTab("doctor")}
          className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            activeTab === "doctor"
              ? "bg-brand-500 text-white shadow-theme-sm"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
          }`}
        >
          Doctor Appointments
        </button>
        <button
          onClick={() => setActiveTab("lab")}
          className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            activeTab === "lab"
              ? "bg-brand-500 text-white shadow-theme-sm"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
          }`}
        >
          Lab Appointments
        </button>
      </div>

      {/* Doctor Appointments Tab */}
      {activeTab === "doctor" && (
        <div>
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
            <FilterField label="Status">
              <select
                value={docStatus}
                onChange={(e) => setDocStatus(e.target.value as AppointmentStatus | "")}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {DOCTOR_STATUS_FILTERS.map((s) => (
                  <option key={s || "all"} value={s}>
                    {s === "" ? "All statuses" : appointmentStatusLabel(s)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="From">
              <input
                type="date"
                value={docDateFrom}
                onChange={(e) => setDocDateFrom(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                value={docDateTo}
                onChange={(e) => setDocDateTo(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </FilterField>
            <button
              onClick={loadDoctor}
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
            >
              Refresh
            </button>
          </div>

          {docError && (
            <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {docError}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
            {docLoading ? (
              <TruckLoader label="Loading appointments…" />
            ) : docItems.length === 0 ? (
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
                    {docPageItems.map((appt) => (
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
                          {appt.doctor_name ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {appt.branch_name ?? "—"}
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
                              onClick={() => viewDocDetail(appt)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            >
                              View
                            </button>
                            {canConfirm(appt) && can("appointments:confirm") && (
                              <DocActionBtn label="Confirm" color="brand" onClick={() => openDocAction(appt, "confirm")} />
                            )}
                            {canPay(appt) && can("appointments:payment") && (
                              <DocActionBtn label="Pay" color="brand" onClick={() => openDocAction(appt, "pay")} />
                            )}
                            {canComplete(appt) && can("appointments:complete") && (
                              <DocActionBtn label="Complete" color="success" onClick={() => openDocAction(appt, "complete")} />
                            )}
                            {canCancel(appt) && can("appointments:cancel") && (
                              <DocActionBtn label="Cancel" color="error" onClick={() => openDocAction(appt, "cancel")} />
                            )}
                            <button
                              onClick={() => showDocHistory(appt)}
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
            {docItems.length > 10 && (
              <div className="mt-4 flex justify-center">
                <Pagination currentPage={docPage} totalPages={docTotalPages} onPageChange={setDocPage} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lab Appointments Tab */}
      {activeTab === "lab" && (
        <div>
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
            <FilterField label="Branch">
              <select
                value={labBranch}
                onChange={(e) => setLabBranch(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                value={labStatus}
                onChange={(e) => setLabStatus(e.target.value as LabTestAppointmentStatus | "")}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {LAB_STATUS_FILTERS.map((s) => (
                  <option key={s || "all"} value={s}>
                    {s === "" ? "All statuses" : labTestAppointmentStatusLabel(s)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Patient">
              <input
                type="text"
                value={labSearch}
                onChange={(e) => setLabSearch(e.target.value)}
                placeholder="Search..."
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </FilterField>
            <FilterField label="From">
              <input
                type="date"
                value={labDateFrom}
                onChange={(e) => setLabDateFrom(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                value={labDateTo}
                onChange={(e) => setLabDateTo(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </FilterField>
            <button
              onClick={loadLab}
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
            >
              Refresh
            </button>
          </div>

          {labError && (
            <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {labError}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
            {labLoading ? (
              <TruckLoader label="Loading lab appointments…" />
            ) : labItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                No lab appointments match the current filters.
              </p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                    <TableRow>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        #Number
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Patient
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Test
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Date & Time
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Amount
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Status
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Payment
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {labPageItems.map((appt) => (
                      <TableRow key={appt.id}>
                        <TableCell className="py-3">
                          <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {appt.appointment_number}
                          </p>
                          <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                            {appt.service_mode}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {appt.patient?.name ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {appt.test?.name ?? "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="text-gray-800 text-theme-sm dark:text-white/90">
                            {appt.appointment_date}
                          </p>
                          <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                            {appt.start_time}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {formatCurrency(appt.price, appt.currency)}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge size="sm" color={labTestAppointmentStatusColor(appt.status)}>
                            {labTestAppointmentStatusLabel(appt.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge size="sm" color={labTestPaymentStatusColor(appt.payment_status)}>
                            {labTestPaymentStatusLabel(appt.payment_status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/lab-test-appointments/${appt.id}`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            >
                              View
                            </Link>
                            {canLabApprove(appt) && can("lab_appointments:approve") && (
                              <LabActionLink href={`/lab-test-appointments/${appt.id}/approve`} label="Approve" color="brand" />
                            )}
                            {canLabReject(appt) && can("lab_appointments:reject") && (
                              <LabActionLink href={`/lab-test-appointments/${appt.id}/reject`} label="Reject" color="error" />
                            )}
                            {canLabComplete(appt) && can("lab_appointments:complete") && (
                              <button
                                onClick={() => handleLabComplete(appt.id)}
                                disabled={completingId === appt.id}
                                className="rounded-lg px-2 py-1.5 text-xs font-medium text-success-600 hover:bg-success-50 disabled:opacity-50 dark:hover:bg-success-500/10"
                              >
                                Complete
                              </button>
                            )}
                            {canLabPay(appt) && can("lab_payments:collect") && (
                              <LabActionLink href={`/lab-test-appointments/${appt.id}/collect-payment`} label="Pay" color="brand" />
                            )}
                            {canLabCancel(appt) && can("lab_appointments:cancel") && (
                              <LabActionLink href={`/lab-test-appointments/${appt.id}/cancel`} label="Cancel" color="error" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {labItems.length > 10 && (
              <div className="mt-4 flex justify-center">
                <Pagination currentPage={labPage} totalPages={labTotalPages} onPageChange={setLabPage} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Doctor appointment action modal */}
      <Modal isOpen={isOpen && !!docAction} onClose={closeModal} className="max-w-[500px] p-6 lg:p-8">
        {activeDoc && docAction && (
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {docActionLabel(docAction)} appointment
            </h5>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {activeDoc.scheduled_date} at {activeDoc.scheduled_time} ·{" "}
              {formatCurrency(activeDoc.fee_amount, activeDoc.currency)}
            </p>

            {docAction === "pay" && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Fee amount</label>
                  <input
                    type="number"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Method</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Reference no (optional)</label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>
            )}

            {docAction === "cancel" && (
              <div className="mt-6">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Cancellation reason</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
            )}

            {docAction !== "pay" && docAction !== "cancel" && (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                {docAction === "confirm" && "Mark this appointment as confirmed."}
                {docAction === "complete" && "Mark this appointment as completed."}
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
                onClick={runDocAction}
                disabled={docBusy}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {docBusy ? "Working…" : docActionLabel(docAction)}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal isOpen={isOpen && !!history} onClose={closeModal} className="max-w-[560px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">Status history</h5>
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
                  <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{h.note}</p>
                )}
              </div>
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
      <Modal isOpen={isOpen && showDetail} onClose={closeModal} className="max-w-[560px] p-6 lg:p-8">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">Appointment details</h5>
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
              <DetailRow label="Doctor" value={detail.doctor_name ?? activeDoc?.doctor_name ?? "—"} />
              <DetailRow label="Branch" value={detail.branch_name ?? activeDoc?.branch_name ?? "—"} />
            </dl>
            {detail.patient_details && detail.patient_details.relationship !== "self" && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Visiting patient</h6>
                <dl className="mt-2 space-y-2">
                  <DetailRow label="Name" value={detail.patient_details.name} />
                  <DetailRow label="Phone" value={detail.patient_details.phone ?? "—"} />
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
        initialClinicId={clinicId}
        onBooked={() => {
          if (activeTab === "doctor") loadDoctor();
          else loadLab();
        }}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:w-44">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function DocActionBtn({
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
    <button onClick={onClick} className={`rounded-lg px-2 py-1.5 text-xs font-medium ${colorClass}`}>
      {label}
    </button>
  );
}

function LabActionLink({
  href,
  label,
  color,
}: {
  href: string;
  label: string;
  color: "brand" | "success" | "error";
}) {
  const colorClass = {
    brand: "text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10",
    success: "text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10",
    error: "text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10",
  }[color];
  return (
    <Link href={href} className={`rounded-lg px-2 py-1.5 text-xs font-medium ${colorClass}`}>
      {label}
    </Link>
  );
}

function docActionLabel(action: DoctorAction): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

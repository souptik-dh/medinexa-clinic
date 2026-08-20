"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import TruckLoader from "@/components/common/TruckLoader";
import { useClinicId } from "@/hooks/useClinicId";
import {
  Branch,
  LabTestAppointment,
  LabTestAppointmentStatus,
  labTestAppointmentsApi,
  branchesApi,
} from "@/lib/api";
import {
  labTestAppointmentStatusColor,
  labTestAppointmentStatusLabel,
  labTestPaymentStatusColor,
  labTestPaymentStatusLabel,
  formatCurrency,
} from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

const STATUS_FILTERS: (LabTestAppointmentStatus | "")[] = [
  "",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "CANCELLED",
];

export default function LabTestAppointmentsPanel() {
  const { can } = useAuth();
  const clinicId = useClinicId();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [items, setItems] = useState<LabTestAppointment[]>([]);
  const [statusFilter, setStatusFilter] = useState<LabTestAppointmentStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchName, setSearchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    if (clinicId) {
      branchesApi.list(clinicId).then((res) => setBranches(res.items)).catch(() => {});
    }
  }, [clinicId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await labTestAppointmentsApi.list({
        branch_id: selectedBranch || undefined,
        status: statusFilter || undefined,
        patient_name: searchName || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 50,
      });
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load lab test appointments"));
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, statusFilter, searchName, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async (id: string) => {
    setCompletingId(id);
    try {
      await labTestAppointmentsApi.complete(id);
      toast.success("Lab appointment marked as completed.");
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to complete appointment"));
    } finally {
      setCompletingId(null);
    }
  };

  const canApprove = (a: LabTestAppointment) => a.status === "PENDING";
  const canReject = (a: LabTestAppointment) => a.status === "PENDING";
  const canComplete = (a: LabTestAppointment) => a.status === "APPROVED";
  const canCancel = (a: LabTestAppointment) => a.status === "PENDING" || a.status === "APPROVED";
  const canPay = (a: LabTestAppointment) =>
    a.payment_method === "PAY_AT_CLINIC" &&
    (a.payment_status === "UNPAID" || a.payment_status === "PENDING") &&
    (a.status === "APPROVED" || a.status === "COMPLETED");

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
        <FilterField label="Branch">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LabTestAppointmentStatus | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || "all"} value={s}>
                {s === "" ? "All statuses" : labTestAppointmentStatusLabel(s)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Patient">
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Search..."
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
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
          <TruckLoader label="Loading lab test appointments…" />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No lab test appointments match the current filters.
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
                {items.map((appt) => (
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
                        {canApprove(appt) && can("lab_appointments:approve") && (
                          <ActionLink href={`/lab-test-appointments/${appt.id}/approve`} label="Approve" color="brand" />
                        )}
                        {canReject(appt) && can("lab_appointments:reject") && (
                          <ActionLink href={`/lab-test-appointments/${appt.id}/reject`} label="Reject" color="error" />
                        )}
                        {canComplete(appt) && can("lab_appointments:complete") && (
                          <button
                            onClick={() => handleComplete(appt.id)}
                            disabled={completingId === appt.id}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-success-600 hover:bg-success-50 disabled:opacity-50 dark:hover:bg-success-500/10"
                          >
                            Complete
                          </button>
                        )}
                        {canPay(appt) && can("lab_payments:collect") && (
                          <ActionLink href={`/lab-test-appointments/${appt.id}/collect-payment`} label="Pay" color="brand" />
                        )}
                        {canCancel(appt) && can("lab_appointments:cancel") && (
                          <ActionLink href={`/lab-test-appointments/${appt.id}/cancel`} label="Cancel" color="error" />
                        )}
                      </div>
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:w-40">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function ActionLink({
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

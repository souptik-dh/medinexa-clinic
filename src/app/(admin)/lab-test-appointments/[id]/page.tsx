"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";
import { LabTestAppointmentDetail, labTestAppointmentsApi } from "@/lib/api";
import {
  labTestAppointmentStatusColor,
  labTestAppointmentStatusLabel,
  labTestPaymentStatusLabel,
  formatCurrency,
} from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

export default function LabTestAppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [detail, setDetail] = useState<LabTestAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    labTestAppointmentsApi
      .get(id)
      .then(setDetail)
      .catch((err) => setError(getErrorMessage(err, "Failed to load appointment details")))
      .finally(() => setLoading(false));
  }, [id]);

  const canApprove = detail?.status === "PENDING" && can("lab_appointments:approve");
  const canReject = detail?.status === "PENDING" && can("lab_appointments:reject");
  const canCancel =
    (detail?.status === "PENDING" || detail?.status === "APPROVED") &&
    can("lab_appointments:cancel");
  const canPay =
    !!detail &&
    detail.payment_method === "PAY_AT_CLINIC" &&
    (detail.payment_status === "UNPAID" || detail.payment_status === "PENDING") &&
    (detail.status === "APPROVED" || detail.status === "COMPLETED") &&
    can("lab_payments:collect");

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Appointment Details"
        items={[{ label: "Lab Appointments", href: "/lab-test-appointments" }]}
      />
      <div className="max-w-[600px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : error ? (
          <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {detail.appointment_number}
                </p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {detail.appointment_date} at {detail.start_time} - {detail.service_mode}
                </p>
              </div>
              <Badge size="sm" color={labTestAppointmentStatusColor(detail.status)}>
                {labTestAppointmentStatusLabel(detail.status)}
              </Badge>
            </div>

            <dl className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <DetailRow label="Test" value={detail.test?.name ?? "—"} />
              <DetailRow label="Branch" value={detail.branch?.name ?? "—"} />
              <DetailRow label="Price" value={formatCurrency(detail.price, detail.currency)} />
              <DetailRow label="Payment" value={labTestPaymentStatusLabel(detail.payment_status)} />
            </dl>

            {(detail.patient_notes || detail.clinic_notes) && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Notes</h6>
                {detail.patient_notes && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Patient: {detail.patient_notes}
                  </p>
                )}
                {detail.clinic_notes && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Clinic: {detail.clinic_notes}
                  </p>
                )}
              </div>
            )}

            {detail.precautions && detail.precautions.length > 0 && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Precautions</h6>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {detail.precautions.join(", ")}
                </p>
              </div>
            )}

            {detail.service_mode === "HOME" && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Home Collection
                </h6>
                <dl className="mt-2 space-y-2">
                  <DetailRow label="Address" value={detail.home_address ?? "—"} />
                  <DetailRow label="Contact Phone" value={detail.home_contact_phone ?? "—"} />
                  {detail.home_notes && <DetailRow label="Notes" value={detail.home_notes} />}
                </dl>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Patient</h6>
              <dl className="mt-2 space-y-2">
                <DetailRow label="Name" value={detail.patient.name ?? "—"} />
                <DetailRow label="Email" value={detail.patient.email ?? "—"} />
                <DetailRow label="Phone" value={detail.patient.phone ?? "—"} />
              </dl>
            </div>

            {detail.prescriptions && detail.prescriptions.length > 0 && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Prescriptions</h6>
                <div className="mt-2 space-y-2">
                  {detail.prescriptions.map((rx) => (
                    <a
                      key={rx.id}
                      href={rx.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5 text-sm text-brand-500 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5"
                    >
                      <span>{rx.file_name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(rx.uploaded_at).toLocaleString()}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {detail.payments && detail.payments.length > 0 && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">Payments</h6>
                <div className="mt-2 space-y-2">
                  {detail.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5 dark:border-gray-800"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {formatCurrency(p.amount, detail.currency)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {p.payment_method}
                          {p.reference_no ? ` - ${p.reference_no}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {p.paid_at || p.collected_at
                          ? new Date(p.paid_at ?? p.collected_at!).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <Link
                href="/lab-test-appointments"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Back
              </Link>
              {canReject && (
                <Link
                  href={`/lab-test-appointments/${id}/reject`}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10"
                >
                  Reject
                </Link>
              )}
              {canApprove && (
                <Link
                  href={`/lab-test-appointments/${id}/approve`}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Approve
                </Link>
              )}
              {canPay && (
                <Link
                  href={`/lab-test-appointments/${id}/collect-payment`}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Collect Payment
                </Link>
              )}
              {canCancel && (
                <Link
                  href={`/lab-test-appointments/${id}/cancel`}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10"
                >
                  Cancel
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

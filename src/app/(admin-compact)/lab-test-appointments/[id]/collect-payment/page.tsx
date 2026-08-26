"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { LabTestAppointmentDetail, labTestAppointmentsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";

export default function CollectPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [appt, setAppt] = useState<LabTestAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [referenceNo, setReferenceNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    labTestAppointmentsApi
      .get(id)
      .then(setAppt)
      .catch((err) => setError(getErrorMessage(err, "Failed to load appointment")))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await labTestAppointmentsApi.collectPayment(
        id,
        { reference_no: referenceNo || null },
        crypto.randomUUID()
      );
      toast.success("Payment collected successfully.");
      router.push("/lab-test-appointments");
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to collect payment");
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Collect Payment"
        items={[{ label: "Lab Appointments", href: "/lab-test-appointments" }]}
      />
      {loading ? (
        <DetailSkeleton rows={3} />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="max-w-[500px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          {appt && (
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {appt.appointment_number} - {appt.test?.name ?? "—"} on {appt.appointment_date}
            </p>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Amount
              </label>
              <input
                type="text"
                value={appt ? formatCurrency(appt.price, appt.currency) : ""}
                disabled
                className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 text-sm text-gray-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Reference No (optional)
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                maxLength={255}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/lab-test-appointments")}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              {busy ? "Working..." : "Collect Payment"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

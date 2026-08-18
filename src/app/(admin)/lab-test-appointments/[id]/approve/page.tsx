"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { LabTestAppointmentDetail, labTestAppointmentsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function ApproveLabTestAppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [appt, setAppt] = useState<LabTestAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [precautions, setPrecautions] = useState("");
  const [notes, setNotes] = useState("");
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
      await labTestAppointmentsApi.approve(id, {
        precautions: precautions
          ? precautions.split(",").map((p) => p.trim()).filter(Boolean)
          : undefined,
        clinic_notes: notes || undefined,
      });
      toast.success("Lab appointment approved.");
      router.push("/lab-test-appointments");
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to approve appointment");
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Approve Appointment"
        items={[{ label: "Lab Appointments", href: "/lab-test-appointments" }]}
      />
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
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
                Precautions (optional)
              </label>
              <textarea
                value={precautions}
                onChange={(e) => setPrecautions(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                placeholder="Comma-separated, e.g. Fasting required, Remove metallic jewelry"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Clinic Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={1000}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                placeholder="Internal notes..."
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
              {busy ? "Working..." : "Approve"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

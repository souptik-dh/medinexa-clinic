"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import {
  ApiError,
  LabTestAppointmentDetail,
  LabTestAvailabilityResponse,
  branchLabTestsApi,
  labTestAppointmentsApi,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton, SelectSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useTranslation } from "@/hooks/useTranslation";

// Server error codes that concern the assigned time - shown under the
// "Assign Test Time" field instead of the generic form error banner.
const TIME_ERROR_CODES = new Set([
  "OUTSIDE_SCHEDULE",
  "TIME_IN_PAST",
  "SLOT_NOT_AVAILABLE",
]);

export default function ApproveLabTestAppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [appt, setAppt] = useState<LabTestAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [precautions, setPrecautions] = useState("");
  const [notes, setNotes] = useState("");
  // Clinic-assigned test time ("HH:MM"). New bookings arrive without one;
  // an older booking that already carries a time starts with it selected.
  const [startTime, setStartTime] = useState("");
  const [availability, setAvailability] = useState<LabTestAvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const { pending: isSubmitting, run: runSubmit } = useAsyncAction();
  // Stays set after success so the form can't be re-submitted while the
  // redirect back to the list is still in progress.
  const [submitted, setSubmitted] = useState(false);
  const busy = isSubmitting || submitted;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    labTestAppointmentsApi
      .get(id)
      .then((res) => {
        setAppt(res);
        setStartTime(res.start_time ?? "");
      })
      .catch((err) => setError(getErrorMessage(err, "Failed to load appointment")))
      .finally(() => setLoading(false));
  }, [id]);

  const loadAvailability = useCallback(async () => {
    if (!appt) return;
    setAvailLoading(true);
    setAvailError(null);
    try {
      const res = await branchLabTestsApi.availability(
        appt.branch_id,
        appt.branch_lab_test_id,
        appt.appointment_date
      );
      setAvailability(res);
    } catch (err) {
      setAvailability(null);
      setAvailError(getErrorMessage(err, "Failed to load available test times"));
    } finally {
      setAvailLoading(false);
    }
  }, [appt]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Assignable times: free slots that haven't ended yet, plus the booking's
  // own current time (if any) so an older booking can be confirmed as-is.
  const timeOptions = useMemo(() => {
    const options = (availability?.slots ?? [])
      .filter((s) => s.available && !s.ended)
      .map((s) => ({ value: s.start, label: `${s.start} - ${s.end}` }));
    if (appt?.start_time && !options.some((o) => o.value === appt.start_time)) {
      options.push({
        value: appt.start_time,
        label: appt.end_time
          ? `${appt.start_time} - ${appt.end_time} (current)`
          : `${appt.start_time} (current)`,
      });
      options.sort((a, b) => a.value.localeCompare(b.value));
    }
    return options;
  }, [availability, appt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitted) return;
    if (!startTime) {
      setTimeError("Assign a test time before confirming the booking.");
      return;
    }
    // Locked: a repeated click/Enter while the request is in flight is a no-op.
    await runSubmit(async () => {
      setError(null);
      setTimeError(null);
      try {
        await labTestAppointmentsApi.approve(id, {
          start_time: startTime,
          precautions: precautions
            ? precautions.split(",").map((p) => p.trim()).filter(Boolean)
            : undefined,
          clinic_notes: notes || undefined,
        });
        toast.success(`Lab booking confirmed for ${appt?.appointment_date ?? ""} at ${startTime}.`);
        setSubmitted(true);
        router.push("/lab-test-appointments");
      } catch (err) {
        const msg = getErrorMessage(err, "Failed to confirm booking");
        const isTimeError =
          err instanceof ApiError &&
          (TIME_ERROR_CODES.has(err.code) ||
            (err.code === "VALIDATION_ERROR" && err.field === "start_time"));
        if (isTimeError) {
          setTimeError(msg);
          // The grid has moved on (slot taken / time passed) - refresh it.
          loadAvailability();
        } else {
          setError(msg);
        }
        toast.error(msg);
      }
    });
  };

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Confirm Booking"
        items={[{ label: "Lab Appointments", href: "/lab-test-appointments" }]}
      />
      {loading ? (
        <div className="max-w-[500px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <DetailSkeleton rows={3} />
        </div>
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
            {appt && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Assign Test Time <span className="text-error-500">*</span>
                </label>
                {availLoading ? (
                  <SelectSkeleton />
                ) : availError ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-error-600 dark:text-error-400">{availError}</p>
                    <button
                      type="button"
                      onClick={() => loadAvailability()}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                    >
                      {t("common.retry")}
                    </button>
                  </div>
                ) : timeOptions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No test times are free on {appt.appointment_date}. Reject the booking or ask
                    the patient to rebook for another date.
                  </p>
                ) : (
                  <select
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setTimeError(null);
                    }}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="">Select a time</option>
                    {timeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {timeError && (
                  <p className="mt-1.5 text-xs text-error-600 dark:text-error-400">{timeError}</p>
                )}
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  The patient is notified of the assigned date and time.
                </p>
              </div>
            )}
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
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !appt || !startTime}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {busy ? "Confirming…" : "Confirm Booking"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

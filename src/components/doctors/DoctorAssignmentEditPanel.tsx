"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import TruckLoader from "@/components/common/TruckLoader";
import { useParams, useRouter } from "next/navigation";
import {
  BranchDoctor,
  BranchOperatingDay,
  DoctorAssignmentException,
  SlotTemplateItem,
  SlotType,
  branchScheduleApi,
  doctorsApi,
} from "@/lib/api";
import { validateSlotTemplates } from "@/components/doctors/InviteDoctorForm";
import { SlotTypeOption, inputClass } from "@/components/doctors/scheduleShared";
import SlotWeekEditor from "@/components/doctors/SlotWeekEditor";
import DatePicker from "@/components/form/date-picker";
import { formatDate, today } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { getErrorMessage } from "@/lib/errorMessage";

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDates(from: string, to: string): string[] {
  if (!from || !to) return [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(formatDateOnly(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function DoctorAssignmentEditPanel() {
  const router = useRouter();
  const params = useParams<{ branchId?: string; doctorId?: string }>();
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const doctorId = typeof params.doctorId === "string" ? params.doctorId : "";
  const { user, can } = useAuth();
  // A doctor editing their own assignment may only change slot_type/slot_template/
  // certificate — the backend rejects fee_amount from a doctor with 403
  // FEE_OWNER_CONTROLLED, so it must never be included in that role's PATCH body.
  const isDoctorSelf = user?.role === "doctor";
  const canManage = isDoctorSelf || can("doctors:manage");

  const [doctor, setDoctor] = useState<BranchDoctor | null>(null);
  const [loading, setLoading] = useState(true);

  const [fee, setFee] = useState("");
  const [certificate, setCertificate] = useState("");
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [slotType, setSlotType] = useState<SlotType>("fixed");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([]);
  const [slotsDirty, setSlotsDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const certificateFileRef = useRef<HTMLInputElement | null>(null);

  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[] | null>(null);

  const [exceptions, setExceptions] = useState<DoctorAssignmentException[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [exceptionMode, setExceptionMode] = useState<"single" | "range">("single");
  const [newExceptionDate, setNewExceptionDate] = useState(today());
  const [rangeFrom, setRangeFrom] = useState(today());
  const [rangeTo, setRangeTo] = useState(today());
  const [newExceptionReason, setNewExceptionReason] = useState("");
  const [exceptionBusy, setExceptionBusy] = useState(false);

  const MAX_RANGE_DAYS = 180;

  const rangeDates = enumerateDates(rangeFrom, rangeTo);

  const load = useCallback(async () => {
    if (!branchId || !doctorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await doctorsApi.listByBranch(branchId);
      const found = res.items.find((d) => d.id === doctorId) ?? null;
      if (!found) {
        setError("Doctor not found at this branch.");
      } else {
        setDoctor(found);
        setFee(String(found.fee_amount));
        setCertificate(found.certificate_url ?? "");
        setSlotType(found.slot_type ?? "fixed");
        setSlots([]);
        setSlotsDirty(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load doctor"));
    } finally {
      setLoading(false);
    }
  }, [branchId, doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!branchId) return;
    branchScheduleApi
      .get(branchId)
      .then((res) => setOperatingDays(res.operating_days))
      .catch(() => setOperatingDays(null));
  }, [branchId]);

  const loadExceptions = useCallback(async (assignmentId: string) => {
    setExceptionsLoading(true);
    setExceptionsError(null);
    try {
      const res = await doctorsApi.listExceptions(assignmentId);
      setExceptions(res.items);
    } catch (err) {
      setExceptions([]);
      setExceptionsError(getErrorMessage(err, "Failed to load leave dates"));
    } finally {
      setExceptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (doctor) loadExceptions(doctor.assignment_id);
  }, [doctor, loadExceptions]);

  const addExceptions = async () => {
    if (!doctor) return;
    if (exceptionMode === "single" && !newExceptionDate) return;
    if (exceptionMode === "range" && rangeDates.length === 0) return;
    if (rangeDates.length > MAX_RANGE_DAYS) {
      setExceptionsError(`That range spans ${rangeDates.length} days — please pick ${MAX_RANGE_DAYS} days or fewer at a time.`);
      return;
    }
    setExceptionBusy(true);
    setExceptionsError(null);
    const reason = newExceptionReason.trim() || null;
    try {
      // One call marks the whole range as a leave — the backend stores it as a single
      // { excluded_date, end_date } row, not one row per day.
      await doctorsApi.createException(doctor.assignment_id, {
        excluded_date: exceptionMode === "range" ? rangeFrom : newExceptionDate,
        end_date: exceptionMode === "range" ? rangeTo : undefined,
        reason,
      });
      setNewExceptionReason("");
      await loadExceptions(doctor.assignment_id);
      toast.success("Leave date(s) added successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not add leave date(s)");
      setExceptionsError(message);
      toast.error(message);
    } finally {
      setExceptionBusy(false);
    }
  };

  const removeException = async (exception: DoctorAssignmentException) => {
    if (!doctor) return;
    setExceptionBusy(true);
    setExceptionsError(null);
    try {
      await doctorsApi.removeException(doctor.assignment_id, exception.id);
      await loadExceptions(doctor.assignment_id);
      toast.success("Leave date removed successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not remove leave date");
      setExceptionsError(message);
      toast.error(message);
    } finally {
      setExceptionBusy(false);
    }
  };

  const updateSlots = (next: SlotTemplateItem[]) => {
    setSlotsDirty(true);
    setSlots(next);
  };

  const handleCertificateSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doctor) return;
    setUploadingCertificate(true);
    setError(null);
    try {
      const res = await doctorsApi.uploadAssignmentCertificate(doctor.assignment_id, file);
      setCertificate(res.certificate_url);
    } catch (err) {
      setError(getErrorMessage(err, "Certificate upload failed"));
    } finally {
      setUploadingCertificate(false);
      if (certificateFileRef.current) certificateFileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!doctor) return;
    if (!canManage) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    const amount = Number(fee);
    if (!isDoctorSelf && (!amount || amount <= 0)) {
      setError("Enter a valid fee amount greater than 0.");
      return;
    }
    if (slotsDirty) {
      const slotError = validateSlotTemplates(slots);
      if (slotError) {
        setError(slotError);
        return;
      }
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await doctorsApi.updateAssignment(doctor.assignment_id, {
        ...(isDoctorSelf ? {} : { fee_amount: amount }),
        certificate: certificate.trim() || undefined,
        slot_type: slotType,
        ...(slotsDirty ? { slot_template: slots } : {}),
      });
      toast.success("Assignment updated successfully.");
      router.push(isDoctorSelf ? "/doctor-schedule" : "/doctors");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to update assignment. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        You do not have permission to edit doctor assignments.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <TruckLoader label="Loading…" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error ?? "Doctor not found."}
        </div>
        <button
          onClick={() => router.push("/doctors")}
          className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Back to doctors
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Edit assignment — {doctor.name}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Update this doctor&apos;s consultation fee and certificate for this branch.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Fee amount {!isDoctorSelf && "*"}
          </label>
          <input
            type="number"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            disabled={isDoctorSelf}
            className={`${inputClass} ${isDoctorSelf ? "cursor-not-allowed opacity-60" : ""}`}
          />
          {isDoctorSelf && (
            <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
              Set by the clinic — you can&apos;t change your own consultation fee.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Certificate
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={certificateFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleCertificateSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => certificateFileRef.current?.click()}
              disabled={uploadingCertificate}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              {uploadingCertificate
                ? "Uploading…"
                : certificate
                  ? "Replace certificate"
                  : "Upload certificate"}
            </button>
            {certificate ? (
              <a
                href={certificate}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-500 hover:underline"
              >
                View certificate
              </a>
            ) : (
              <span className="text-sm text-warning-600 dark:text-orange-400">
                ⚠ Pending — no certificate uploaded
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Assignment period
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Start date:</span>{" "}
            {doctor.start_date ? formatDate(doctor.start_date) : "—"}
            <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
            <span className="font-medium">End date:</span>{" "}
            {doctor.end_date ? formatDate(doctor.end_date) : "Ongoing"}
          </p>
          <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
            Derived from the slot template below (earliest start, latest end) — edit the slot
            rows to change it, this isn&apos;t set directly.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Leave / unavailable dates
          </label>
          <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
            Mark individual dates within the schedule below where this doctor is unavailable
            (holiday, leave, etc.) — the recurring weekly pattern is skipped only on these dates.
          </p>

          {exceptionsError && (
            <div className="mb-3 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {exceptionsError}
            </div>
          )}

          {(() => {
            // The list endpoint now also returns cancelled leaves (kept as an audit
            // record server-side) — only active ones are still "in effect" here.
            const activeExceptions = exceptions.filter((e) => e.status !== "cancelled");
            if (exceptionsLoading) {
              return <TruckLoader label="Loading…" />;
            }
            if (activeExceptions.length === 0) {
              return <p className="text-sm text-gray-500 dark:text-gray-400">No leave dates added.</p>;
            }
            return (
              <ul className="mb-4 space-y-2">
                {activeExceptions.map((exception) => (
                  <li
                    key={exception.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {exception.end_date && exception.end_date !== exception.excluded_date
                          ? `${formatDate(exception.excluded_date)} – ${formatDate(exception.end_date)}`
                          : formatDate(exception.excluded_date)}
                      </p>
                      {exception.reason && (
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                          {exception.reason}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeException(exception)}
                      disabled={exceptionBusy}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-40 dark:hover:bg-error-500/10"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}

          <div className="mb-3 flex gap-3">
            <SlotTypeOption
              label="Single date"
              description="Mark one date unavailable."
              selected={exceptionMode === "single"}
              onClick={() => setExceptionMode("single")}
            />
            <SlotTypeOption
              label="Date range"
              description="Mark every date in a range unavailable, with the same reason."
              selected={exceptionMode === "range"}
              onClick={() => setExceptionMode("range")}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {exceptionMode === "single" ? (
              <div>
                <DatePicker
                  id="exception-date"
                  label="Date"
                  placeholder="Select a date"
                  defaultDate={newExceptionDate || undefined}
                  onChange={(_, dateStr) => {
                    if (dateStr) setNewExceptionDate(dateStr);
                  }}
                />
              </div>
            ) : (
              <>
                <div>
                  <DatePicker
                    id="exception-range-from"
                    label="From"
                    placeholder="Select a date"
                    defaultDate={rangeFrom || undefined}
                    onChange={(_, dateStr) => {
                      if (dateStr) {
                        setRangeFrom(dateStr);
                        if (rangeTo < dateStr) setRangeTo(dateStr);
                      }
                    }}
                  />
                </div>
                <div>
                  <DatePicker
                    id="exception-range-to"
                    label="To"
                    placeholder="Select a date"
                    defaultDate={rangeTo || undefined}
                    onChange={(_, dateStr) => {
                      if (dateStr) setRangeTo(dateStr);
                    }}
                  />
                </div>
              </>
            )}
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Reason (optional, applied to {exceptionMode === "range" ? "every date in the range" : "this date"})
              </label>
              <input
                type="text"
                value={newExceptionReason}
                onChange={(e) => setNewExceptionReason(e.target.value)}
                placeholder="On leave"
                className={inputClass}
              />
            </div>
            <button
              onClick={addExceptions}
              disabled={
                exceptionBusy ||
                (exceptionMode === "single" ? !newExceptionDate : rangeDates.length === 0)
              }
              className="h-11 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              {exceptionBusy
                ? "Adding…"
                : exceptionMode === "range"
                  ? `Add ${rangeDates.length || ""} date${rangeDates.length === 1 ? "" : "s"}`
                  : "Add"}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Booking type
          </label>
          <div className="flex gap-3">
            <SlotTypeOption
              label="Fixed"
              description="Patients pick a specific time slot."
              selected={slotType === "fixed"}
              onClick={() => setSlotType("fixed")}
            />
            <SlotTypeOption
              label="Sequential"
              description="As per bookings — patients get the next free slot in the range, no time picker."
              selected={slotType === "sequential"}
              onClick={() => setSlotType("sequential")}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {slotType === "sequential" ? "Booking range(s)" : "Weekly schedule"}
          </label>
          <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
            Click a day to add or remove it. Leave untouched to keep this doctor&apos;s current
            schedule.
          </p>
          <SlotWeekEditor
            slots={slots}
            onChange={updateSlots}
            operatingDays={operatingDays}
          />
        </div>

      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={() => router.push("/doctors")}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

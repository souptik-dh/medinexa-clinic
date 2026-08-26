"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton/Skeleton";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import DatePicker from "@/components/form/date-picker";
import {
  ApiError,
  BranchClosure,
  BranchLabTest,
  BranchOperatingDay,
  LabTestAppointment,
  LabTestAvailabilityResponse,
  LabTestSchedule,
  PatientRelationship,
  branchLabTestsApi,
  branchScheduleApi,
  labTestAppointmentsApi,
  labTestSchedulesApi,
} from "@/lib/api";
import { addDays, formatCurrency, formatDateISO, today } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

// How far ahead to compute day-level availability from the clinic/lab
// schedule for greying out non-bookable dates in the calendar.
const CALENDAR_RANGE_DAYS = 60;

// A date is bookable for a lab test when: it isn't in the past, the branch
// is open that weekday (branch-wide operating days), the branch's lab-test
// schedule has an active window for that weekday, and no active closure
// covers the date. This mirrors the server-side rule described for the
// per-date availability endpoint, computed client-side so the whole
// calendar can be highlighted from three cheap one-shot calls instead of a
// per-day round trip.
function isDateBookable(
  dateStr: string,
  operatingDays: BranchOperatingDay[],
  labSchedules: LabTestSchedule[],
  closures: BranchClosure[]
): boolean {
  if (dateStr < today()) return false;
  const weekday = new Date(`${dateStr}T00:00:00`).getDay();
  const branchOpen = operatingDays.find((d) => d.weekday === weekday)?.is_open ?? true;
  if (!branchOpen) return false;
  const hasActiveSchedule = labSchedules.some((s) => s.weekday === weekday && s.is_active);
  if (!hasActiveSchedule) return false;
  const closed = closures.some(
    (c) => c.status !== "cancelled" && dateStr >= c.start_date && dateStr <= c.end_date
  );
  return !closed;
}

const RELATIONSHIPS: PatientRelationship[] = [
  "self",
  "spouse",
  "child",
  "parent",
  "sibling",
  "friend",
  "other",
];

const GENDERS = ["male", "female", "other", "prefer_not_to_say"] as const;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

interface BookLabTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful booking so the host page can refresh its list. */
  onBooked?: (appointment: LabTestAppointment) => void;
  /** Pre-selects this clinic in the branch picker (clinic-owner context). */
  initialClinicId?: string;
}

export default function BookLabTestModal({
  isOpen,
  onClose,
  onBooked,
  initialClinicId,
}: BookLabTestModalProps) {
  const [branch, setBranch] = useState<BranchSelectValue | null>(null);

  const [tests, setTests] = useState<BranchLabTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [testId, setTestId] = useState("");

  const [date, setDate] = useState(today());
  const [availability, setAvailability] = useState<LabTestAvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  // Clinic-schedule-derived day availability, for greying out non-bookable
  // dates directly in the calendar - branch-wide, so it only depends on the
  // chosen branch, not on which specific lab test is selected.
  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[]>([]);
  const [labSchedules, setLabSchedules] = useState<LabTestSchedule[]>([]);
  const [closures, setClosures] = useState<BranchClosure[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  const [relationship, setRelationship] = useState<PatientRelationship>("self");
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [notes, setNotes] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const test = tests.find((t) => t.id === testId) ?? null;

  const reset = useCallback(() => {
    setBranch(null);
    setTests([]);
    setTestId("");
    setDate(today());
    setAvailability(null);
    setSelectedTime("");
    setOperatingDays([]);
    setLabSchedules([]);
    setClosures([]);
    setScheduleLoaded(false);
    setRelationship("self");
    setPatientName("");
    setPhone("");
    setAge("");
    setGender("");
    setNotes("");
    setFormError(null);
    setTestsError(null);
    setAvailError(null);
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  // Load the selected branch's active lab tests whenever the branch changes.
  useEffect(() => {
    setTests([]);
    setTestId("");
    setAvailability(null);
    setSelectedTime("");
    setAvailError(null);
    if (!branch) return;
    let active = true;
    setTestsLoading(true);
    setTestsError(null);
    branchLabTestsApi
      .list(branch.id, "active")
      .then((res) => {
        if (!active) return;
        setTests(res.items);
        if (res.items.length === 0) setTestsError("No lab tests are configured for this branch yet.");
      })
      .catch((err) => {
        if (active) setTestsError(getErrorMessage(err, "Failed to load lab tests"));
      })
      .finally(() => {
        if (active) setTestsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branch]);

  // Clinic schedule for the chosen branch (operating days + closures) and
  // its lab-test weekly schedule - drives the calendar's day highlighting.
  useEffect(() => {
    setOperatingDays([]);
    setLabSchedules([]);
    setClosures([]);
    setScheduleLoaded(false);
    if (!branch) return;
    let active = true;
    Promise.all([
      branchScheduleApi.get(branch.id),
      labTestSchedulesApi.list(branch.id),
      branchScheduleApi.listClosures(branch.id),
    ])
      .then(([schedule, labScheduleRes, closureRes]) => {
        if (!active) return;
        setOperatingDays(schedule.operating_days);
        setLabSchedules(labScheduleRes.items);
        setClosures(closureRes.items);
        setScheduleLoaded(true);
      })
      .catch(() => {
        // Non-fatal — the calendar just won't grey out unavailable dates.
      });
    return () => {
      active = false;
    };
  }, [branch]);

  const bookableByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (!scheduleLoaded) return map;
    for (let i = 0; i <= CALENDAR_RANGE_DAYS; i++) {
      const d = addDays(today(), i);
      map[d] = isDateBookable(d, operatingDays, labSchedules, closures);
    }
    return map;
  }, [scheduleLoaded, operatingDays, labSchedules, closures]);

  const nonBookableDates = useMemo(
    () => Object.keys(bookableByDate).filter((d) => !bookableByDate[d]),
    [bookableByDate]
  );
  const calendarRangeEnd = scheduleLoaded ? addDays(today(), CALENDAR_RANGE_DAYS) : undefined;

  const markDayAvailability = useCallback(
    (_dates: Date[], _dateStr: string, _instance: unknown, data?: unknown) => {
      const dayElem = data as HTMLElement | undefined;
      if (!dayElem) return;
      if (
        dayElem.classList.contains("prevMonthDay") ||
        dayElem.classList.contains("nextMonthDay") ||
        dayElem.classList.contains("flatpickr-disabled")
      ) {
        return;
      }
      const cellDate = (dayElem as unknown as { dateObj?: Date }).dateObj;
      if (!cellDate) return;
      const key = formatDateISO(cellDate);
      if (!(key in bookableByDate)) return;
      const isBookable = bookableByDate[key] === true;
      const marker = document.createElement("span");
      marker.setAttribute("aria-hidden", "true");
      marker.className = isBookable
        ? "absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-success-500"
        : "absolute bottom-1.5 left-1/2 h-0.5 w-2 -translate-x-1/2 rounded-full bg-gray-400 dark:bg-gray-500";
      dayElem.style.position = "relative";
      dayElem.appendChild(marker);
    },
    [bookableByDate]
  );

  const loadAvailability = useCallback(async () => {
    if (!branch || !testId || !date) {
      setAvailability(null);
      return;
    }
    setAvailLoading(true);
    setAvailError(null);
    setSelectedTime("");
    try {
      const res = await branchLabTestsApi.availability(branch.id, testId, date);
      setAvailability(res);
    } catch (err) {
      setAvailability(null);
      setAvailError(getErrorMessage(err, "Failed to load availability"));
    } finally {
      setAvailLoading(false);
    }
  }, [branch, testId, date]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const submit = async () => {
    if (!branch) {
      setFormError("Please select a branch.");
      return;
    }
    if (!testId) {
      setFormError("Please select a lab test.");
      return;
    }
    if (!date) {
      setFormError("Please pick a date.");
      return;
    }
    if (!selectedTime) {
      setFormError("Please pick a time slot.");
      return;
    }
    if (test?.prescription_required) {
      setFormError(
        "This test requires a prescription on file, which isn't supported by this booking form yet."
      );
      return;
    }
    if (!patientName.trim()) {
      setFormError("Please enter the patient's name.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const created = await labTestAppointmentsApi.create(
        {
          branch_id: branch.id,
          branch_lab_test_id: testId,
          service_mode: "CLINIC",
          appointment_date: date,
          start_time: selectedTime,
          payment_method: "PAY_AT_CLINIC",
          patient_notes: notes.trim() || undefined,
          patient_details: {
            relationship,
            name: patientName.trim(),
            phone: phone.trim() || null,
            age: age.trim() === "" ? null : Number(age),
            gender: gender || null,
          },
        },
        crypto.randomUUID()
      );
      toast.success(`Lab test booked for ${patientName.trim()} at ${selectedTime}`);
      onBooked?.(created);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "SLOT_ALREADY_BOOKED"
          ? "That slot was just taken. Please pick another."
          : getErrorMessage(err, "Unable to book the lab test appointment.");
      setFormError(message);
      toast.error(message);
      // Refresh slots so a just-taken slot no longer looks available.
      loadAvailability();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[900px] p-6 lg:p-8">
      <div>
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Book a lab test for a patient
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Front-desk booking &mdash; the appointment is created on behalf of the walk-in
          patient.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Appointment — left column */}
          <div className="space-y-5">
            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Appointment
            </h6>

            {/* Branch (role-aware: locked for staff, picker for owners) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Clinic &amp; branch
              </label>
              <BranchSelect
                value={branch?.id ?? ""}
                onChange={setBranch}
                initialClinicId={initialClinicId}
              />
            </div>

            {/* Lab test */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Lab test
              </label>
              {testsLoading ? (
                <ListSkeleton rows={3} />
              ) : testsError ? (
                <p className="text-sm text-error-600 dark:text-error-400">{testsError}</p>
              ) : (
                <select
                  value={testId}
                  onChange={(e) => setTestId(e.target.value)}
                  disabled={!branch}
                  className={inputClass}
                >
                  <option value="">
                    {!branch ? "Select a branch first" : "Select lab test"}
                  </option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.test_name} — {formatCurrency(t.price, t.currency)}
                    </option>
                  ))}
                </select>
              )}
              {test && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge size="sm" color="light">
                    {formatCurrency(test.price, test.currency)}
                  </Badge>
                  <Badge size="sm" color="light">
                    {test.duration_minutes} min
                  </Badge>
                  {test.prescription_required && (
                    <Badge size="sm" color="warning">
                      Prescription required
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Date
              </label>
              {!testId ? (
                <div className="flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-500">
                  Select a lab test to see availability
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 p-2 dark:border-gray-800">
                  <DatePicker
                    id="book-lab-test-date"
                    inline
                    defaultDate={date}
                    minDate={today()}
                    maxDate={calendarRangeEnd}
                    disable={nonBookableDates}
                    onDayCreate={markDayAvailability}
                    onChange={(_, dateStr) => {
                      if (dateStr) setDate(dateStr);
                    }}
                  />
                </div>
              )}
              {testId && (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-success-500" /> Available
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500" /> Not available
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-brand-500" /> Selected
                    </span>
                  </div>
                  <p className="mt-2 rounded-lg border border-brand-500/20 bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                    Availability follows the clinic&apos;s schedule — past dates, closed
                    weekdays, and branch closures are not selectable.
                  </p>
                </>
              )}
            </div>

            {/* Time slot */}
            {testId && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Time slot
                </label>
                {availLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-16 rounded-lg" />
                    ))}
                  </div>
                ) : availError ? (
                  <p className="text-sm text-error-600 dark:text-error-400">{availError}</p>
                ) : !availability || availability.slots.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No bookable slots for this date.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availability.slots.map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.start)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          selectedTime === slot.start
                            ? "border-brand-500 bg-brand-500 text-white"
                            : slot.available
                              ? "border-success-500/30 bg-success-50 text-success-700 hover:border-brand-400 dark:bg-success-500/10 dark:text-success-500"
                              : "border-gray-200 bg-gray-50 text-gray-400 line-through dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-500"
                        }`}
                      >
                        {slot.start}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Patient details — right column */}
          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-gray-800 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Patient details
            </h6>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Relationship
              </label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as PatientRelationship)}
                className={inputClass}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r === "self" ? "Self" : r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Name <span className="text-error-500">*</span>
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Visitor's full name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Age
              </label>
              <input
                type="number"
                min={0}
                max={150}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Gender
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
              >
                <option value="">Prefer not to say</option>
                {GENDERS.filter((g) => g !== "prefer_not_to_say").map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — e.g. fasting since last night"
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 lg:col-span-2">
              {formError}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !branch || !testId}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Booking…" : "Book lab test"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

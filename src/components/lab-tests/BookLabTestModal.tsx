"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import { SelectSkeleton, Skeleton } from "@/components/ui/skeleton/Skeleton";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import DatePicker from "@/components/form/date-picker";
import BookingPatientPicker, {
  BookingPatientPickerHandle,
} from "@/components/appointments/BookingPatientPicker";
import LabTestPrecautionsList from "@/components/lab-tests/LabTestPrecautionsList";
import {
  ApiError,
  BranchClosure,
  BranchLabTest,
  BranchOperatingDay,
  LabTestAppointment,
  LabTestAppointmentServiceMode,
  LabTestAvailabilityResponse,
  LabTestSchedule,
  branchLabTestsApi,
  branchScheduleApi,
  labTestAppointmentsApi,
  labTestSchedulesApi,
  patientDocumentsApi,
} from "@/lib/api";
import { addDays, formatCurrency, formatDateISO, today } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction, useLatestRequest } from "@/hooks/useAsyncAction";

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

// Bookability of the picked date, derived from the per-date availability
// grid. The booker never picks a time (the clinic assigns it when
// confirming), so slots only tell us whether the date can take a booking.
type DateStatus = "bookable" | "closed" | "ended" | "full";

function getDateStatus(availability: LabTestAvailabilityResponse): DateStatus {
  const { slots } = availability;
  if (slots.length === 0) return "closed";
  if (slots.every((s) => s.ended)) return "ended";
  if (!slots.some((s) => s.available)) return "full";
  return "bookable";
}

// Server error codes for POST /lab-test-appointments date problems, mapped
// to the same wording the booker sees from the date-status hint.
const BOOKING_ERROR_KEYS: Record<string, string> = {
  DATE_IN_PAST: "bookLabTestModal.dateInPast",
  OUTSIDE_SCHEDULE: "bookLabTestModal.dateClosed",
  BOOKING_TIME_ENDED: "bookLabTestModal.dateEnded",
  DATE_FULLY_BOOKED: "bookLabTestModal.dateFull",
  DUPLICATE_BOOKING: "bookLabTestModal.duplicateBooking",
};

const DATE_STATUS_KEYS: Record<Exclude<DateStatus, "bookable">, string> = {
  closed: "bookLabTestModal.dateClosed",
  ended: "bookLabTestModal.dateEnded",
  full: "bookLabTestModal.dateFull",
};

// Prescription upload limits - same as the patient-documents upload endpoint.
const PRESCRIPTION_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const PRESCRIPTION_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
const PRESCRIPTION_MAX_BYTES = 20 * 1024 * 1024;

// Returns a locale key for an invalid prescription file, or null when it's fine.
function prescriptionFileErrorKey(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!PRESCRIPTION_EXTENSIONS.includes(ext)) return "bookLabTestModal.prescriptionInvalidType";
  if (file.size > PRESCRIPTION_MAX_BYTES) return "bookLabTestModal.prescriptionTooLarge";
  return null;
}

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
  const { t } = useTranslation();
  const [branch, setBranch] = useState<BranchSelectValue | null>(null);

  const [tests, setTests] = useState<BranchLabTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);
  // Set only when the list request itself failed (not for "no tests");
  // Retry bumps the reload key to re-run the branch's lab-test load.
  const [testsLoadFailed, setTestsLoadFailed] = useState(false);
  const [testsReloadKey, setTestsReloadKey] = useState(0);
  const [testId, setTestId] = useState("");

  const [date, setDate] = useState(today());
  const [availability, setAvailability] = useState<LabTestAvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  // Clinic-schedule-derived day availability, for greying out non-bookable
  // dates directly in the calendar - branch-wide, so it only depends on the
  // chosen branch, not on which specific lab test is selected.
  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[]>([]);
  const [labSchedules, setLabSchedules] = useState<LabTestSchedule[]>([]);
  const [closures, setClosures] = useState<BranchClosure[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  const patientPickerRef = useRef<BookingPatientPickerHandle>(null);
  const [referringDoctor, setReferringDoctor] = useState("");
  const [notes, setNotes] = useState("");

  // Only the modes the chosen branch test offers can be picked.
  const [serviceMode, setServiceMode] = useState<LabTestAppointmentServiceMode>("CLINIC");
  const [homeAddress, setHomeAddress] = useState("");
  const [homeContactPhone, setHomeContactPhone] = useState("");
  const [homeNotes, setHomeNotes] = useState("");

  // Uploaded as a PRESCRIPTION patient document linked to the booking right
  // after it's created (reception has the paper prescription in hand).
  const prescriptionInputRef = useRef<HTMLInputElement>(null);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);
  const [uploadingPrescription, setUploadingPrescription] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const { pending: isSubmitting, run: runSubmit } = useAsyncAction();
  // Rapid date/test changes: only the newest availability response may land.
  const { begin: beginAvail, isLatest: isLatestAvail } = useLatestRequest();

  const test = tests.find((t) => t.id === testId) ?? null;

  const reset = useCallback(() => {
    setBranch(null);
    setTests([]);
    setTestId("");
    setDate(today());
    setAvailability(null);
    setOperatingDays([]);
    setLabSchedules([]);
    setClosures([]);
    setScheduleLoaded(false);
    patientPickerRef.current?.reset();
    setReferringDoctor("");
    setNotes("");
    setServiceMode("CLINIC");
    setHomeAddress("");
    setHomeContactPhone("");
    setHomeNotes("");
    setPrescriptionFile(null);
    setPrescriptionError(null);
    if (prescriptionInputRef.current) prescriptionInputRef.current.value = "";
    setFormError(null);
    setTestsError(null);
    setAvailError(null);
  }, []);

  // Picking a test snaps the service mode to one that test allows.
  const selectTest = (id: string) => {
    setTestId(id);
    const next = tests.find((x) => x.id === id);
    setServiceMode(next && !next.clinic_available && next.home_collection_available ? "HOME" : "CLINIC");
  };

  const clearPrescription = () => {
    setPrescriptionFile(null);
    setPrescriptionError(null);
    if (prescriptionInputRef.current) prescriptionInputRef.current.value = "";
  };

  const onPrescriptionSelected = (file: File | null) => {
    setPrescriptionFile(file);
    const errorKey = file ? prescriptionFileErrorKey(file) : null;
    setPrescriptionError(errorKey ? t(errorKey) : null);
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  // Load the selected branch's active lab tests whenever the branch changes.
  useEffect(() => {
    setTests([]);
    setTestId("");
    setAvailability(null);
    setAvailError(null);
    if (!branch) return;
    let active = true;
    setTestsLoading(true);
    setTestsError(null);
    setTestsLoadFailed(false);
    branchLabTestsApi
      .list(branch.id, "active")
      .then((res) => {
        if (!active) return;
        setTests(res.items);
        if (res.items.length === 0) setTestsError(t("bookLabTestModal.noLabTestsConfigured"));
      })
      .catch((err) => {
        if (!active) return;
        setTestsError(getErrorMessage(err, t("labTests.failedToLoad")));
        setTestsLoadFailed(true);
      })
      .finally(() => {
        if (active) setTestsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branch, testsReloadKey]);

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
    const token = beginAvail();
    if (!branch || !testId || !date) {
      setAvailability(null);
      setAvailLoading(false);
      return;
    }
    setAvailLoading(true);
    setAvailError(null);
    setAvailability(null);
    try {
      const res = await branchLabTestsApi.availability(branch.id, testId, date);
      if (!isLatestAvail(token)) return;
      setAvailability(res);
    } catch (err) {
      if (!isLatestAvail(token)) return;
      setAvailability(null);
      setAvailError(getErrorMessage(err, t("doctorProfile.failedToLoadAvailability")));
    } finally {
      if (isLatestAvail(token)) setAvailLoading(false);
    }
  }, [branch, testId, date, beginAvail, isLatestAvail]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // null while unknown (loading / failed / nothing picked) - the server
  // re-validates the date on submit either way.
  const dateStatus: DateStatus | null =
    !availLoading && availability ? getDateStatus(availability) : null;
  const dateBlocked = dateStatus !== null && dateStatus !== "bookable";

  const submit = async () => {
    if (!branch) {
      setFormError(t("bookAppointmentModal.pleaseSelectBranch"));
      return;
    }
    if (!testId) {
      setFormError(t("branchLabTestForm.pleaseSelectLabTest"));
      return;
    }
    if (!date) {
      setFormError(t("bookAppointmentModal.pleaseSelectDate"));
      return;
    }
    if (dateStatus && dateStatus !== "bookable") {
      setFormError(t(DATE_STATUS_KEYS[dateStatus]));
      return;
    }
    const isHome = serviceMode === "HOME";
    if (isHome && !homeAddress.trim()) {
      setFormError(t("bookLabTestModal.pleaseEnterHomeAddress"));
      return;
    }
    if (test?.prescription_required && !prescriptionFile) {
      setPrescriptionError(t("bookLabTestModal.pleaseAttachPrescription"));
      setFormError(t("bookLabTestModal.pleaseAttachPrescription"));
      return;
    }
    if (prescriptionFile) {
      const fileErrorKey = prescriptionFileErrorKey(prescriptionFile);
      if (fileErrorKey) {
        setPrescriptionError(t(fileErrorKey));
        setFormError(t(fileErrorKey));
        return;
      }
    }
    const patientError = patientPickerRef.current?.validate();
    if (patientError) {
      setFormError(patientError);
      return;
    }
    // Locked: a repeated click while the booking is in flight is a no-op.
    await runSubmit(async () => {
      setFormError(null);
      try {
        const base = patientPickerRef.current!.buildDetails();
        const patientDetails = {
          ...base,
          phone: base.phone ?? "",
          age: base.age ?? 0,
          gender: base.gender ?? "",
        };
        // Booking first, then the prescription: the booking route lets clinic
        // staff book a prescription-required test without one, and the upload
        // needs the new booking's id to attach the file to it.
        const created = await labTestAppointmentsApi.create(
          {
            branch_id: branch.id,
            branch_lab_test_id: testId,
            service_mode: serviceMode,
            appointment_date: date,
            payment_method: "PAY_AT_CLINIC",
            referring_doctor_name: referringDoctor.trim() || undefined,
            patient_notes: notes.trim() || undefined,
            ...(isHome
              ? {
                  home_address: homeAddress.trim(),
                  home_contact_phone: homeContactPhone.trim() || undefined,
                  home_notes: homeNotes.trim() || undefined,
                }
              : {}),
            patient_details: patientDetails,
          },
          crypto.randomUUID()
        );
        onBooked?.(created);
        if (!prescriptionFile) {
          toast.success(t("bookLabTestModal.labTestRequestedFor", { name: patientDetails.name, date }));
          onClose();
          return;
        }
        // The booking stands either way - an upload failure is reported, not rolled back.
        setUploadingPrescription(true);
        try {
          await patientDocumentsApi.upload({
            patient_id:
              created.patient_details?.patient_id ?? created.patient?.id ?? created.patient_id,
            document_type: "PRESCRIPTION",
            title: test?.test_name
              ? t("bookLabTestModal.prescriptionTitle", { test: test.test_name })
              : t("bookLabTestModal.prescription"),
            branch_id: branch.id,
            lab_test_appointment_id: created.id,
            file: prescriptionFile,
          });
          toast.success(
            t("bookLabTestModal.bookedWithPrescription", { name: patientDetails.name, date })
          );
        } catch (uploadErr) {
          toast.error(
            t("bookLabTestModal.prescriptionUploadFailed", {
              name: patientDetails.name,
              date,
              reason: getErrorMessage(uploadErr, t("patientDocuments.uploadFailed")),
            }),
            { duration: 10000 }
          );
        } finally {
          setUploadingPrescription(false);
        }
        onClose();
      } catch (err) {
        // Patient details are kept so the user can pick another date and retry.
        const errorKey = err instanceof ApiError ? BOOKING_ERROR_KEYS[err.code] : undefined;
        const message = errorKey
          ? t(errorKey)
          : getErrorMessage(err, t("bookLabTestModal.unableToBook"));
        if (!patientPickerRef.current?.applyServerError(err, message)) {
          setFormError(message);
        }
        toast.error(message);
        // Refresh the date status so a just-filled/closed date shows as such.
        loadAvailability();
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeDisabled={isSubmitting} className="max-w-[900px] p-6 lg:p-8">
      <div>
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("bookLabTestModal.title")}
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("bookAppointmentModal.subtitle")}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Appointment — left column */}
          <div className="space-y-5">
            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {t("calendar.appointmentTitle")}
            </h6>

            {/* Branch (role-aware: locked for staff, picker for owners) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("bookAppointmentModal.clinicAndBranch")}
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
                {t("bookLabTestModal.labTest")}
              </label>
              {testsLoading ? (
                <SelectSkeleton />
              ) : testsError ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-error-600 dark:text-error-400">{testsError}</p>
                  {testsLoadFailed && (
                    <button
                      type="button"
                      onClick={() => setTestsReloadKey((k) => k + 1)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                    >
                      {t("common.retry")}
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={testId}
                  onChange={(e) => selectTest(e.target.value)}
                  disabled={!branch}
                  className={inputClass}
                >
                  <option value="">
                    {!branch ? t("bookAppointmentModal.selectBranchFirst") : t("bookLabTestModal.selectLabTest")}
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
                    {t("bookLabTestModal.durationMinShort", { count: test.duration_minutes })}
                  </Badge>
                  {test.prescription_required && (
                    <Badge size="sm" color="warning">
                      {t("bookLabTestModal.prescriptionRequired")}
                    </Badge>
                  )}
                </div>
              )}
              {test && test.precautions && test.precautions.length > 0 && (
                <div className="mt-3">
                  <LabTestPrecautionsList
                    precautions={test.precautions}
                    hint={t("labTestPrecautions.bookingHint")}
                  />
                </div>
              )}
            </div>

            {/* Service mode - only the modes this branch test offers */}
            {test && test.clinic_available && test.home_collection_available && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("bookLabTestModal.serviceMode")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["CLINIC", "HOME"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setServiceMode(mode)}
                      disabled={isSubmitting}
                      aria-pressed={serviceMode === mode}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                        serviceMode === mode
                          ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      {mode === "CLINIC" ? t("bookLabTestModal.modeClinic") : t("bookLabTestModal.modeHome")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {test && !(test.clinic_available && test.home_collection_available) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("bookLabTestModal.serviceMode")}:{" "}
                {serviceMode === "HOME" ? t("bookLabTestModal.modeHome") : t("bookLabTestModal.modeClinic")}
              </p>
            )}

            {test && serviceMode === "HOME" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("bookLabTestModal.homeAddress")} <span className="text-error-500">*</span>
                  </label>
                  <textarea
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder={t("bookLabTestModal.homeAddressPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("bookLabTestModal.homeContactPhone")}
                  </label>
                  <input
                    type="tel"
                    value={homeContactPhone}
                    onChange={(e) => setHomeContactPhone(e.target.value)}
                    maxLength={32}
                    placeholder={t("common.optional")}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("bookLabTestModal.homeNotes")}
                  </label>
                  <input
                    type="text"
                    value={homeNotes}
                    onChange={(e) => setHomeNotes(e.target.value)}
                    maxLength={500}
                    placeholder={t("bookLabTestModal.homeNotesPlaceholder")}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("bookLabTestModal.bookingDate")}
              </label>
              {!testId ? (
                <div className="flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-500">
                  {t("bookLabTestModal.selectLabTestToSeeAvailability")}
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
                      <span className="h-2 w-2 rounded-full bg-success-500" /> {t("bookAppointmentModal.availableLegend")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500" /> {t("bookLabTestModal.notAvailableLegend")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-brand-500" /> {t("doctors.selected")}
                    </span>
                  </div>
                  <p className="mt-2 rounded-lg border border-brand-500/20 bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                    {t("bookLabTestModal.availabilityFollowsSchedule")}
                  </p>
                </>
              )}
            </div>

            {/* Date status - the clinic assigns the test time on confirmation */}
            {testId && (
              <div>
                {availLoading ? (
                  <Skeleton className="h-10 w-full rounded-lg" />
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
                ) : dateStatus && dateStatus !== "bookable" ? (
                  <p className="rounded-lg border border-error-500/30 bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                    {t(DATE_STATUS_KEYS[dateStatus])}
                  </p>
                ) : dateStatus === "bookable" ? (
                  <p className="rounded-lg border border-success-500/30 bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                    {t("bookLabTestModal.dateBookable")}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t("bookLabTestModal.timeAssignedByClinic")}
                </p>
              </div>
            )}
          </div>

          {/* Patient details — right column */}
          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-gray-800 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {t("bookAppointmentModal.patientDetails")}
            </h6>
            <BookingPatientPicker ref={patientPickerRef} disabled={isSubmitting} requirePhone />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("bookLabTestModal.referringDoctor")}
              </label>
              <input
                type="text"
                value={referringDoctor}
                onChange={(e) => setReferringDoctor(e.target.value)}
                placeholder={t("common.optional")}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("bookLabTestModal.notes")}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("bookLabTestModal.notesPlaceholder")}
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {test?.prescription_required ? (
                  <>
                    {t("bookLabTestModal.prescription")} <span className="text-error-500">*</span>
                  </>
                ) : (
                  t("bookLabTestModal.prescriptionOptional")
                )}
              </label>
              {test?.prescription_required && (
                <p className="mb-2 rounded-lg border border-warning-500/30 bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                  {t("bookLabTestModal.prescriptionRequiredNote")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={prescriptionInputRef}
                  type="file"
                  accept={PRESCRIPTION_ACCEPT}
                  disabled={isSubmitting}
                  onChange={(e) => onPrescriptionSelected(e.target.files?.[0] ?? null)}
                  className="block min-w-0 flex-1 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100 dark:text-gray-300 dark:file:bg-brand-500/10 dark:file:text-brand-400"
                />
                {prescriptionFile && (
                  <button
                    type="button"
                    onClick={clearPrescription}
                    disabled={isSubmitting}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-error-500/10"
                  >
                    {t("bookLabTestModal.removeFile")}
                  </button>
                )}
              </div>
              {prescriptionError ? (
                <p className="mt-1 text-xs text-error-600 dark:text-error-400">{prescriptionError}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("bookLabTestModal.prescriptionFileHint")}
                </p>
              )}
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
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting || !branch || !testId || availLoading || dateBlocked}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {uploadingPrescription
              ? t("bookLabTestModal.uploadingPrescription")
              : isSubmitting
                ? t("bookLabTestModal.booking")
                : t("bookLabTestModal.bookLabTest")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

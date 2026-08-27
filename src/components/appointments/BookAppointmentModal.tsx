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
  Appointment,
  AvailabilityRangeResponse,
  AvailabilityResponse,
  BranchDoctor,
  PatientRelationship,
  appointmentsApi,
  doctorsApi,
} from "@/lib/api";
import { addDays, formatCurrency, formatDateISO, today } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

// How far ahead to fetch the doctor's day-level availability for greying out
// non-bookable dates in the calendar - matches the availability-range endpoint's cap.
const CALENDAR_RANGE_DAYS = 60;

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

interface BookAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful booking so the host page can refresh its list. */
  onBooked?: (appointment: Appointment) => void;
  /** Pre-selects this clinic in the branch picker (clinic-owner context). */
  initialClinicId?: string;
}

export default function BookAppointmentModal({
  isOpen,
  onClose,
  onBooked,
  initialClinicId,
}: BookAppointmentModalProps) {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<BranchSelectValue | null>(null);

  const [doctors, setDoctors] = useState<BranchDoctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState("");

  const [date, setDate] = useState(today());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  // Day-level availability for the chosen doctor, used to grey out
  // non-bookable dates directly in the calendar popup.
  const [calendarAvailability, setCalendarAvailability] =
    useState<AvailabilityRangeResponse | null>(null);

  const [relationship, setRelationship] = useState<PatientRelationship>("self");
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doctor = doctors.find((d) => d.id === doctorId) ?? null;

  const reset = useCallback(() => {
    setBranch(null);
    setDoctors([]);
    setDoctorId("");
    setDate(today());
    setAvailability(null);
    setSelectedTime("");
    setCalendarAvailability(null);
    setRelationship("self");
    setPatientName("");
    setPhone("");
    setAge("");
    setGender("");
    setFormError(null);
    setDoctorsError(null);
    setAvailError(null);
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  // Load the selected branch's doctors whenever the branch changes.
  useEffect(() => {
    setDoctors([]);
    setDoctorId("");
    setAvailability(null);
    setSelectedTime("");
    setAvailError(null);
    setCalendarAvailability(null);
    if (!branch) return;
    let active = true;
    setDoctorsLoading(true);
    setDoctorsError(null);
    doctorsApi
      .listByBranch(branch.id)
      .then((res) => {
        if (!active) return;
        setDoctors(res.items);
        if (res.items.length === 0) setDoctorsError(t("doctors.noDoctorsAssignedToBranch"));
      })
      .catch((err) => {
        if (active) setDoctorsError(getErrorMessage(err, t("doctors.failedToLoad")));
      })
      .finally(() => {
        if (active) setDoctorsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branch]);

  const loadAvailability = useCallback(async () => {
    if (!branch || !doctorId || !date || doctor?.slot_type !== "fixed") {
      setAvailability(null);
      return;
    }
    setAvailLoading(true);
    setAvailError(null);
    setSelectedTime("");
    try {
      const res = await doctorsApi.availability(doctorId, date, branch.id);
      setAvailability(res);
    } catch (err) {
      setAvailability(null);
      setAvailError(getErrorMessage(err, t("doctorProfile.failedToLoadAvailability")));
    } finally {
      setAvailLoading(false);
    }
  }, [branch, doctorId, date, doctor?.slot_type]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Day-level availability for the chosen doctor, so the calendar can grey
  // out dates that are on leave, outside the doctor's schedule, or fully
  // booked - before the front-desk staff even picks a date.
  useEffect(() => {
    setCalendarAvailability(null);
    if (!branch || !doctorId) return;
    let active = true;
    doctorsApi
      .availabilityRange(doctorId, {
        from: today(),
        to: addDays(today(), CALENDAR_RANGE_DAYS),
        branchId: branch.id,
      })
      .then((res) => {
        if (active) setCalendarAvailability(res);
      })
      .catch(() => {
        // Non-fatal — the calendar just won't grey out unavailable dates.
      });
    return () => {
      active = false;
    };
  }, [branch, doctorId]);

  const nonBookableDates = useMemo(
    () =>
      calendarAvailability
        ? calendarAvailability.dates.filter((d) => !d.is_bookable).map((d) => d.date)
        : [],
    [calendarAvailability]
  );
  const calendarRangeEnd = calendarAvailability?.dates.length
    ? calendarAvailability.dates[calendarAvailability.dates.length - 1].date
    : undefined;
  // Keyed by "YYYY-MM-DD" so onDayCreate can look up each cell's status in
  // O(1) - dates outside the fetched window simply aren't in the map.
  const bookableByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    calendarAvailability?.dates.forEach((d) => {
      map[d.date] = d.is_bookable === true;
    });
    return map;
  }, [calendarAvailability]);

  // Marks each in-range day cell with a small dot: green + available, grey
  // dash + not available - mirrors the legend shown under the calendar.
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

  const submit = async () => {
    if (!branch) {
      setFormError(t("bookAppointmentModal.pleaseSelectBranch"));
      return;
    }
    if (!doctorId) {
      setFormError(t("bookAppointmentModal.pleaseSelectDoctor"));
      return;
    }
    if (!date) {
      setFormError(t("bookAppointmentModal.pleaseSelectDate"));
      return;
    }
    if (doctor && doctor.slot_type === "fixed" && !selectedTime) {
      setFormError(t("bookAppointmentModal.pleaseSelectTimeSlot"));
      return;
    }
    if (!patientName.trim()) {
      setFormError(t("bookAppointmentModal.pleaseEnterPatientName"));
      return;
    }
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const created = await appointmentsApi.create(
        {
          doctor_id: doctorId,
          branch_id: branch.id,
          date,
          ...(doctor && doctor.slot_type === "fixed" ? { time: selectedTime } : {}),
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
      toast.success(
        t("bookAppointmentModal.appointmentBookedFor", { name: created.patient_details?.name ?? patientName.trim() }) +
          (created.scheduled_time ? t("bookAppointmentModal.atTime", { time: created.scheduled_time }) : "")
      );
      onBooked?.(created);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "SLOT_ALREADY_BOOKED"
          ? t("bookAppointmentModal.slotJustTaken")
          : getErrorMessage(err, t("bookAppointmentModal.unableToBook"));
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
          {t("bookAppointmentModal.title")}
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

            {/* Doctor */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("dashboard.doctor")}
              </label>
              {doctorsLoading ? (
                <ListSkeleton rows={3} />
              ) : doctorsError ? (
                <p className="text-sm text-error-600 dark:text-error-400">{doctorsError}</p>
              ) : (
                <select
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  disabled={!branch}
                  className={inputClass}
                >
                  <option value="">
                    {!branch ? t("bookAppointmentModal.selectBranchFirst") : t("appointments.selectDoctor")}
                  </option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.specialization ? ` — ${d.specialization}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {doctor && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge size="sm" color="light">
                    {t("bookAppointmentModal.feeLabel", { amount: formatCurrency(doctor.fee_amount, doctor.currency) })}
                  </Badge>
                  <Badge size="sm" color={doctor.slot_type === "sequential" ? "info" : "light"}>
                    {doctor.slot_type === "sequential" ? t("bookAppointmentModal.asPerBookings") : t("bookAppointmentModal.fixedSlots")}
                  </Badge>
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("schedule.date")}
              </label>
              {!doctorId ? (
                <div className="flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-500">
                  {t("bookAppointmentModal.selectDoctorToSeeAvailability")}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 p-2 dark:border-gray-800">
                  <DatePicker
                    id="book-appointment-date"
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
              {doctorId && (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-success-500" /> {t("bookAppointmentModal.availableLegend")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500" /> {t("bookAppointmentModal.doctorNotAvailableLegend")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-brand-500" /> {t("doctors.selected")}
                    </span>
                  </div>
                  <p className="mt-2 rounded-lg border border-brand-500/20 bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                    {t("bookAppointmentModal.dateSelectHint")}
                  </p>
                </>
              )}
            </div>

            {/* Time slot — fixed doctors only */}
            {doctor && doctor.slot_type === "fixed" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("bookAppointmentModal.timeSlot")}
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
                    {t("bookAppointmentModal.noBookableSlots")}
                  </p>
                ) : availability.status === "leave" ? (
                  <p className="text-sm text-error-600 dark:text-error-400">
                    {t("doctorProfile.doctorOnLeave")}
                    {availability.leave?.reason ? ` — ${availability.leave.reason}` : ""}.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availability.slots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          selectedTime === slot.time
                            ? "border-brand-500 bg-brand-500 text-white"
                            : slot.available
                              ? "border-success-500/30 bg-success-50 text-success-700 hover:border-brand-400 dark:bg-success-500/10 dark:text-success-500"
                              : "border-gray-200 bg-gray-50 text-gray-400 line-through dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-500"
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {doctor && doctor.slot_type === "sequential" && (
              <p className="rounded-lg border border-info-500/30 bg-info-50 px-4 py-3 text-sm text-info-700 dark:bg-info-500/10 dark:text-info-400">
                {t("bookAppointmentModal.sequentialBookingHint")}
              </p>
            )}
          </div>

          {/* Patient details — right column */}
          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-gray-800 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {t("bookAppointmentModal.patientDetails")}
            </h6>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.relationship")}
              </label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as PatientRelationship)}
                className={inputClass}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r === "self" ? t("appointments.self") : r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.name")} <span className="text-error-500">*</span>
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder={t("bookAppointmentModal.visitorFullName")}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.phone")}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("common.optional")}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.age")}
              </label>
              <input
                type="number"
                min={0}
                max={150}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={t("common.optional")}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.genderLabel")}
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("bookAppointmentModal.preferNotToSay")}</option>
                {GENDERS.filter((g) => g !== "prefer_not_to_say").map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </select>
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
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || !branch || !doctorId}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? t("appointments.booking") : t("appointments.bookAppointmentBtn")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

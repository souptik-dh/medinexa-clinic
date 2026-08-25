"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton/Skeleton";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import {
  ApiError,
  Appointment,
  AvailabilityResponse,
  BranchDoctor,
  PatientRelationship,
  appointmentsApi,
  doctorsApi,
} from "@/lib/api";
import { formatCurrency, today } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

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
    if (!branch) return;
    let active = true;
    setDoctorsLoading(true);
    setDoctorsError(null);
    doctorsApi
      .listByBranch(branch.id)
      .then((res) => {
        if (!active) return;
        setDoctors(res.items);
        if (res.items.length === 0) setDoctorsError("No doctors are assigned to this branch yet.");
      })
      .catch((err) => {
        if (active) setDoctorsError(getErrorMessage(err, "Failed to load doctors"));
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
      setAvailError(getErrorMessage(err, "Failed to load availability"));
    } finally {
      setAvailLoading(false);
    }
  }, [branch, doctorId, date, doctor?.slot_type]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const submit = async () => {
    if (!branch) {
      setFormError("Please select a branch.");
      return;
    }
    if (!doctorId) {
      setFormError("Please select a doctor.");
      return;
    }
    if (!date) {
      setFormError("Please pick a date.");
      return;
    }
    if (doctor && doctor.slot_type === "fixed" && !selectedTime) {
      setFormError("Please pick a time slot.");
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
        `Appointment booked for ${created.patient_details?.name ?? patientName.trim()}` +
          (created.scheduled_time ? ` at ${created.scheduled_time}` : "")
      );
      onBooked?.(created);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "SLOT_ALREADY_BOOKED"
          ? "That slot was just taken. Please pick another."
          : getErrorMessage(err, "Unable to book the appointment.");
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
          Book appointment for a patient
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

            {/* Doctor */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Doctor
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
                    {!branch ? "Select a branch first" : "Select doctor"}
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
                    Fee: {formatCurrency(doctor.fee_amount, doctor.currency)}
                  </Badge>
                  <Badge size="sm" color={doctor.slot_type === "sequential" ? "info" : "light"}>
                    {doctor.slot_type === "sequential" ? "As per bookings" : "Fixed slots"}
                  </Badge>
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Date
              </label>
              <input
                type="date"
                value={date}
                min={today()}
                onChange={(e) => setDate(e.target.value)}
                disabled={!doctorId}
                className={inputClass}
              />
            </div>

            {/* Time slot — fixed doctors only */}
            {doctor && doctor.slot_type === "fixed" && (
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
                ) : availability.status === "leave" ? (
                  <p className="text-sm text-error-600 dark:text-error-400">
                    Doctor is on leave for this date
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
                This doctor books as per bookings — the next free slot for the chosen
                date is assigned automatically.
              </p>
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
            disabled={busy || !branch || !doctorId}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Booking…" : "Book appointment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

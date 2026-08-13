"use client";
import React, { useCallback, useId, useState } from "react";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import NmcDoctorSearch, {
  NmcDoctorResult,
} from "@/components/doctors/NmcDoctorSearch";
import DatePicker from "@/components/form/date-picker";
import { useRouter } from "next/navigation";
import {
  ApiError,
  SlotTemplateItem,
  SlotType,
  doctorInvitesApi,
} from "@/lib/api";
import { today } from "@/lib/utils";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50";

export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

export function defaultSlotTemplate(): SlotTemplateItem {
  const start = today();
  return {
    weekday: weekdayOf(start),
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 20,
    start_date: start,
    end_date: null,
  };
}

export function validateSlotTemplates(slots: SlotTemplateItem[]): string | null {
  if (slots.length === 0) return "At least one slot is required.";
  for (const slot of slots) {
    if (slot.end_time <= slot.start_time) {
      return `Slot end time must be after start time (${slot.start_time}).`;
    }
    if (slot.slot_duration_minutes < 5 || slot.slot_duration_minutes > 240) {
      return "Slot duration must be between 5 and 240 minutes.";
    }
    if (!slot.start_date) {
      return "Every slot needs a start date.";
    }
    if (slot.end_date && slot.end_date < slot.start_date) {
      return "A slot's end date must be on or after its start date.";
    }
  }
  return null;
}

export default function InviteDoctorForm() {
  const router = useRouter();

  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phone, setPhone] = useState("");
  const [regNo, setRegNo] = useState("");
  const [smcName, setSmcName] = useState("");
  const [doctorDegree, setDoctorDegree] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [certificate, setCertificate] = useState("");
  const [slotType, setSlotType] = useState<SlotType>("fixed");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([defaultSlotTemplate()]);
  const [verified, setVerified] = useState<NmcDoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onNmcSelect = (doc: NmcDoctorResult) => {
    setVerified(doc);
    setInviteName(doc.name);
    setRegNo(doc.registrationNo);
    setSmcName(doc.council);
    if (doc.doctorDegree) {
      setDoctorDegree(doc.doctorDegree);
    }
  };

  const updateSlot = useCallback((index: number, patch: Partial<SlotTemplateItem>) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }, []);

  const addSlot = () => {
    setSlots((prev) => [...prev, defaultSlotTemplate()]);
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const createInvite = async () => {
    if (!branch) {
      setError("Select a branch for this invite.");
      return;
    }
    const amount = Number(feeAmount);
    if (!inviteName || !inviteEmail || !amount || amount <= 0) {
      setError("Fill in name, email, and a valid fee.");
      return;
    }
    const slotError = validateSlotTemplates(slots);
    if (slotError) {
      setError(slotError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await doctorInvitesApi.create(branch.id, {
        name: inviteName,
        specialization: specialization || null,
        email: inviteEmail,
        phone: phone || null,
        reg_no: regNo || null,
        smc_name: smcName || null,
        doctor_degree: doctorDegree || null,
        fee_amount: amount,
        currency,
        certificate: certificate || null,
        slot_type: slotType,
        slot_template: slots,
      });
      router.push("/doctors");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite creation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Invite a doctor
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          A single-use invite code is emailed to the doctor. The code is never shown here.
        </p>
        <BranchSelect value={branch?.id ?? ""} onChange={setBranch} />
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="space-y-4">
          <NmcDoctorSearch onSelect={onNmcSelect} disabled={busy} />
          {verified && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm dark:bg-success-500/10">
              <div>
                <p className="font-medium text-success-700 dark:text-success-500">
                  Verified in NMC registry
                </p>
                <p className="text-theme-xs text-gray-600 dark:text-gray-300">
                  {verified.name} · Reg. {verified.registrationNo} · {verified.council}
                  {verified.doctorDegree ? ` · ${verified.doctorDegree}` : ""}
                </p>
              </div>
              <button
                onClick={() => setVerified(null)}
                className="shrink-0 text-theme-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email *">
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Specialization">
              <input type="text" value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Phone">
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Registration no.">
              <input type="text" value={regNo} disabled className={inputClass} />
            </Field>
            <Field label="State medical council">
              <input type="text" value={smcName} disabled className={inputClass} />
            </Field>
            <Field label="Degree / qualification">
              <input type="text" value={doctorDegree} disabled className={inputClass} />
            </Field>
            <Field label="Fee amount *">
              <input type="number" min="0" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Currency *">
              <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Certificate URL">
            <input type="text" value={certificate} onChange={(e) => setCertificate(e.target.value)} className={inputClass} />
          </Field>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Booking type *
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
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                {slotType === "sequential" ? "Booking range(s) *" : "Slot template *"}
              </label>
              <button
                onClick={addSlot}
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              >
                + Add slot
              </button>
            </div>
            <div className="space-y-3">
              {slots.map((slot, index) => (
                <SlotTemplateRow
                  key={index}
                  slot={slot}
                  onChange={(patch) => updateSlot(index, patch)}
                  onRemove={() => removeSlot(index)}
                  canRemove={slots.length > 1}
                />
              ))}
            </div>
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
            onClick={createInvite}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SlotTemplateRow({
  slot,
  onChange,
  onRemove,
  canRemove,
}: {
  slot: SlotTemplateItem;
  onChange: (patch: Partial<SlotTemplateItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const startId = useId();
  const endId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const noEndDate = !slot.end_date;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
        <div>
          <DatePicker
            id={`slot-start-${startId}`}
            label="Applies from *"
            placeholder="Select a date"
            defaultDate={slot.start_date || undefined}
            onChange={(_, dateStr) => {
              if (!dateStr) return;
              onChange({
                start_date: dateStr,
                weekday: weekdayOf(dateStr),
                ...(slot.end_date && slot.end_date < dateStr ? { end_date: dateStr } : {}),
              });
            }}
          />
          {slot.start_date && (
            <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
              Repeats every {WEEKDAYS[weekdayOf(slot.start_date)]}
            </p>
          )}
        </div>
        <div className={noEndDate ? "pointer-events-none opacity-40" : undefined}>
          <DatePicker
            id={`slot-end-${endId}`}
            label="Applies until"
            placeholder="No end date"
            defaultDate={slot.end_date || undefined}
            onChange={(_, dateStr) => {
              if (dateStr) onChange({ end_date: dateStr });
            }}
          />
        </div>
        <label className="flex items-center gap-2 pt-8 text-sm text-gray-600 dark:text-gray-400 sm:pt-9">
          <input
            type="checkbox"
            checked={noEndDate}
            onChange={(e) =>
              onChange({ end_date: e.target.checked ? null : slot.start_date })
            }
            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
          />
          Repeats indefinitely
        </label>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 border-t border-gray-100 pt-3 dark:border-gray-800 sm:grid-cols-4">
        <DatePicker
          id={`slot-start-time-${startTimeId}`}
          mode="time"
          label="Start time *"
          placeholder="Select time"
          defaultDate={slot.start_time || undefined}
          onChange={(_, timeStr) => {
            if (timeStr) onChange({ start_time: timeStr });
          }}
        />
        <DatePicker
          id={`slot-end-time-${endTimeId}`}
          mode="time"
          label="End time *"
          placeholder="Select time"
          defaultDate={slot.end_time || undefined}
          onChange={(_, timeStr) => {
            if (timeStr) onChange({ end_time: timeStr });
          }}
        />
        <Field label="Duration (min)">
          <input type="number" min="5" max="240" value={slot.slot_duration_minutes} onChange={(e) => onChange({ slot_duration_minutes: Number(e.target.value) })} className={inputClass} />
        </Field>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="mb-1 rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-40 dark:hover:bg-error-500/10"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export function SlotTypeOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
      }`}
    >
      <p
        className={`text-sm font-medium ${
          selected ? "text-brand-600 dark:text-brand-400" : "text-gray-800 dark:text-white/90"
        }`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  );
}

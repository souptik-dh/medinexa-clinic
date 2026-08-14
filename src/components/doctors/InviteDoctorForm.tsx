"use client";
import React, { useEffect, useState } from "react";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import NmcDoctorSearch, {
  NmcDoctorResult,
} from "@/components/doctors/NmcDoctorSearch";
import SlotWeekEditor from "@/components/doctors/SlotWeekEditor";
import { inputClass, SlotTypeOption } from "@/components/doctors/scheduleShared";
import { useRouter } from "next/navigation";
import {
  ApiError,
  BranchOperatingDay,
  SlotTemplateItem,
  SlotType,
  branchScheduleApi,
  doctorInvitesApi,
} from "@/lib/api";

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
    if (!slot.end_date) {
      return "Every slot needs an end date.";
    }
    if (slot.end_date < slot.start_date) {
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
  const [slots, setSlots] = useState<SlotTemplateItem[]>([]);
  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[] | null>(null);
  const [verified, setVerified] = useState<NmcDoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!branch) {
      setOperatingDays(null);
      return;
    }
    branchScheduleApi
      .get(branch.id)
      .then((res) => setOperatingDays(res.operating_days))
      .catch(() => setOperatingDays(null));
  }, [branch]);

  const onNmcSelect = (doc: NmcDoctorResult) => {
    setVerified(doc);
    setInviteName(doc.name);
    setRegNo(doc.registrationNo);
    setSmcName(doc.council);
    if (doc.doctorDegree) {
      setDoctorDegree(doc.doctorDegree);
    }
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
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {slotType === "sequential" ? "Booking range(s) *" : "Slot template *"}
            </label>
            <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
              Click a day to add a slot for it.
              {!branch && " Select a branch above to see its closed days."}
            </p>
            <SlotWeekEditor slots={slots} onChange={setSlots} operatingDays={operatingDays} />
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

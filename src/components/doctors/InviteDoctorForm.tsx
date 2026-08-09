"use client";
import React, { useCallback, useState } from "react";
import BranchSelect from "@/components/branches/BranchSelect";
import NmcDoctorSearch, {
  NmcDoctorResult,
} from "@/components/doctors/NmcDoctorSearch";
import { useRouter } from "next/navigation";
import {
  ApiError,
  Branch,
  SlotTemplateItem,
  doctorInvitesApi,
} from "@/lib/api";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function InviteDoctorForm() {
  const router = useRouter();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phone, setPhone] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [certificate, setCertificate] = useState("");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([
    { weekday: 1, start_time: "09:00", end_time: "13:00", slot_duration_minutes: 20 },
  ]);
  const [verified, setVerified] = useState<NmcDoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onNmcSelect = (doc: NmcDoctorResult) => {
    setVerified(doc);
    setInviteName(doc.name);
    if (doc.qualification) {
      setSpecialization(doc.qualification);
    }
  };

  const updateSlot = useCallback((index: number, patch: Partial<SlotTemplateItem>) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }, []);

  const addSlot = () => {
    setSlots((prev) => [
      ...prev,
      { weekday: 1, start_time: "09:00", end_time: "13:00", slot_duration_minutes: 20 },
    ]);
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
    if (!inviteName || !inviteEmail || !amount || amount <= 0 || slots.length === 0) {
      setError("Fill in name, email, a valid fee, and at least one slot.");
      return;
    }
    for (const slot of slots) {
      if (slot.end_time <= slot.start_time) {
        setError(`Slot end time must be after start time (${slot.start_time}).`);
        return;
      }
      if (slot.slot_duration_minutes < 5 || slot.slot_duration_minutes > 240) {
        setError("Slot duration must be between 5 and 240 minutes.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await doctorInvitesApi.create(branch.id, {
        name: inviteName,
        specialization: specialization || null,
        email: inviteEmail,
        phone: phone || null,
        fee_amount: amount,
        currency,
        certificate: certificate || null,
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
                  {verified.qualification ? ` · ${verified.qualification}` : ""}
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
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                Slot template *
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
                <div key={index} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:grid-cols-5">
                  <Field label="Day">
                    <select
                      value={slot.weekday}
                      onChange={(e) => updateSlot(index, { weekday: Number(e.target.value) })}
                      className={inputClass}
                    >
                      {WEEKDAYS.map((day, d) => (
                        <option key={d} value={d}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Start">
                    <input type="time" value={slot.start_time} onChange={(e) => updateSlot(index, { start_time: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="End">
                    <input type="time" value={slot.end_time} onChange={(e) => updateSlot(index, { end_time: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Duration (min)">
                    <input type="number" min="5" max="240" value={slot.slot_duration_minutes} onChange={(e) => updateSlot(index, { slot_duration_minutes: Number(e.target.value) })} className={inputClass} />
                  </Field>
                  <button
                    onClick={() => removeSlot(index)}
                    disabled={slots.length === 1}
                    className="mb-1 rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-40 dark:hover:bg-error-500/10"
                  >
                    Remove
                  </button>
                </div>
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

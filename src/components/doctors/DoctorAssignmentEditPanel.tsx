"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, BranchDoctor, SlotTemplateItem, SlotType, doctorsApi } from "@/lib/api";
import { SlotTypeOption } from "@/components/doctors/InviteDoctorForm";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const defaultSlot: SlotTemplateItem = {
  weekday: 1,
  start_time: "09:00",
  end_time: "13:00",
  slot_duration_minutes: 20,
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function DoctorAssignmentEditPanel() {
  const router = useRouter();
  const params = useParams<{ branchId?: string; doctorId?: string }>();
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const doctorId = typeof params.doctorId === "string" ? params.doctorId : "";

  const [doctor, setDoctor] = useState<BranchDoctor | null>(null);
  const [loading, setLoading] = useState(true);

  const [fee, setFee] = useState("");
  const [certificate, setCertificate] = useState("");
  const [slotType, setSlotType] = useState<SlotType>("fixed");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([defaultSlot]);
  const [slotsDirty, setSlotsDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setSlots([defaultSlot]);
        setSlotsDirty(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load doctor");
    } finally {
      setLoading(false);
    }
  }, [branchId, doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateSlot = (index: number, patch: Partial<SlotTemplateItem>) => {
    setSlotsDirty(true);
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSlot = () => {
    setSlotsDirty(true);
    setSlots((prev) => [...prev, { ...defaultSlot }]);
  };

  const removeSlot = (index: number) => {
    setSlotsDirty(true);
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!doctor) return;
    const amount = Number(fee);
    if (!amount || amount <= 0) {
      setError("Enter a valid fee amount greater than 0.");
      return;
    }
    if (slotsDirty) {
      if (slots.length === 0) {
        setError("At least one slot is required.");
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
    }
    setBusy(true);
    setError(null);
    try {
      await doctorsApi.updateAssignment(doctor.assignment_id, {
        fee_amount: amount,
        certificate: certificate.trim() || undefined,
        slot_type: slotType,
        ...(slotsDirty ? { slot_template: slots } : {}),
      });
      router.push("/doctors");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
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
            Fee amount *
          </label>
          <input
            type="number"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Certificate URL
          </label>
          <input
            type="text"
            value={certificate}
            onChange={(e) => setCertificate(e.target.value)}
            className={inputClass}
          />
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
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
              {slotType === "sequential" ? "Booking range(s)" : "Slot template"}
            </label>
            <button
              onClick={addSlot}
              className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              + Add slot
            </button>
          </div>
          <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
            Leave untouched to keep this doctor&apos;s current schedule.
          </p>
          <div className="space-y-3">
            {slots.map((slot, index) => (
              <div
                key={index}
                className="grid grid-cols-2 items-end gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:grid-cols-5"
              >
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Day
                  </label>
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
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Start
                  </label>
                  <input
                    type="time"
                    value={slot.start_time}
                    onChange={(e) => updateSlot(index, { start_time: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    End
                  </label>
                  <input
                    type="time"
                    value={slot.end_time}
                    onChange={(e) => updateSlot(index, { end_time: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="240"
                    value={slot.slot_duration_minutes}
                    onChange={(e) =>
                      updateSlot(index, { slot_duration_minutes: Number(e.target.value) })
                    }
                    className={inputClass}
                  />
                </div>
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

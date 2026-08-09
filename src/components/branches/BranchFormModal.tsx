"use client";
import React from "react";
import { Modal } from "@/components/ui/modal";

export interface BranchFormValues {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  lat: string;
  lng: string;
}

export const emptyBranchForm = (): BranchFormValues => ({
  name: "",
  address: "",
  phone: "",
  timezone: "Asia/Kolkata",
  lat: "",
  lng: "",
});

export const branchFormFrom = (b: {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  lat?: number | null;
  lng?: number | null;
}): BranchFormValues => ({
  name: b.name,
  address: b.address,
  phone: b.phone,
  timezone: b.timezone,
  lat: b.lat !== null && b.lat !== undefined ? String(b.lat) : "",
  lng: b.lng !== null && b.lng !== undefined ? String(b.lng) : "",
});

interface BranchFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  clinicName?: string;
  values: BranchFormValues;
  onChange: (values: BranchFormValues) => void;
  busy: boolean;
  onSubmit: () => void;
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function BranchFormModal({
  isOpen,
  onClose,
  mode,
  clinicName,
  values,
  onChange,
  busy,
  onSubmit,
}: BranchFormModalProps) {
  const set = (patch: Partial<BranchFormValues>) => onChange({ ...values, ...patch });

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[560px] p-6 lg:p-8">
      <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        {mode === "create" ? "Create branch" : "Edit branch"}
        {clinicName && (
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            — {clinicName}
          </span>
        )}
      </h5>
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name *">
            <input
              type="text"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Phone *">
            <input
              type="text"
              value={values.phone}
              onChange={(e) => set({ phone: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Address *">
          <input
            type="text"
            value={values.address}
            onChange={(e) => set({ address: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              value={values.lat}
              onChange={(e) => set({ lat: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              value={values.lng}
              onChange={(e) => set({ lng: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Timezone *">
            <input
              type="text"
              value={values.timezone}
              onChange={(e) => set({ timezone: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Close
        </button>
        <button
          onClick={onSubmit}
          disabled={busy || !values.name || !values.address || !values.phone || !values.timezone}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {busy ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
        </button>
      </div>
    </Modal>
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

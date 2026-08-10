"use client";
import React, { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { branchesApi } from "@/lib/api";

export interface BranchFormValues {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  lat: string;
  lng: string;
  pincode: string;
  district: string;
  state: string;
  postOfficeName: string;
}

export const emptyBranchForm = (): BranchFormValues => ({
  name: "",
  address: "",
  phone: "",
  timezone: "Asia/Kolkata",
  lat: "",
  lng: "",
  pincode: "",
  district: "",
  state: "",
  postOfficeName: "",
});

export const branchFormFrom = (b: {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  lat?: number | null;
  lng?: number | null;
  pincode?: string | null;
  district?: string | null;
  state?: string | null;
}): BranchFormValues => ({
  name: b.name,
  address: b.address,
  phone: b.phone,
  timezone: b.timezone,
  lat: b.lat !== null && b.lat !== undefined ? String(b.lat) : "",
  lng: b.lng !== null && b.lng !== undefined ? String(b.lng) : "",
  pincode: b.pincode ?? "",
  district: b.district ?? "",
  state: b.state ?? "",
  postOfficeName: "",
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

  const [pincodeResults, setPincodeResults] = useState<{
    Name: string;
    BranchType: string;
    DeliveryStatus: string;
    District: string;
    State: string;
    Pincode: string;
  }[]>([]);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState<string | null>(null);

  const lookupPincode = useCallback(async (code: string) => {
    if (!code) return;
    setPincodeLoading(true);
    setPincodeError(null);
    try {
      const res = await branchesApi.lookupPincode(code);
      const first = res && res.length > 0 ? res[0] : null;
      if (!first || !first.PostOffice) {
        setPincodeResults([]);
        setPincodeError("No post offices found for this pincode");
      } else {
        setPincodeResults(first.PostOffice);
      }
    } catch (err) {
      setPincodeResults([]);
      setPincodeError(err instanceof Error ? err.message : String(err));
    } finally {
      setPincodeLoading(false);
    }
  }, []);

  useEffect(() => {
    // auto lookup when pincode reaches 6 digits
    if (values.pincode && values.pincode.trim().length === 6) {
      lookupPincode(values.pincode.trim());
    }
  }, [values.pincode, lookupPincode]);

  const selectPostOffice = (po: any) => {
    set({
      pincode: po.Pincode,
      district: po.District,
      state: po.State,
    });
    // If address is empty, populate with post office name
    if (!values.address) {
      set({ address: po.Name });
    }
    setPincodeResults([]);
  };

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
          <Field label="Pincode">
            <div className="flex gap-2">
              <input
                type="text"
                value={values.pincode}
                onChange={(e) => set({ pincode: e.target.value })}
                className={inputClass}
              />
              <button
                onClick={() => lookupPincode(values.pincode)}
                disabled={pincodeLoading || !values.pincode}
                className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {pincodeLoading ? "Checking…" : "Validate"}
              </button>
            </div>
            {pincodeError && (
              <p className="mt-2 text-xs text-error-600">{pincodeError}</p>
            )}
            {pincodeResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
                {pincodeResults.map((po) => (
                  <button
                    key={po.Name + po.BranchType}
                    onClick={() => selectPostOffice(po)}
                    className="w-full text-left px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <div className="font-medium">{po.Name}</div>
                    <div className="text-xs text-gray-500">{po.BranchType} — {po.District}, {po.State}</div>
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="District">
            <input
              type="text"
              value={values.district}
              onChange={(e) => set({ district: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={values.state}
              onChange={(e) => set({ state: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

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

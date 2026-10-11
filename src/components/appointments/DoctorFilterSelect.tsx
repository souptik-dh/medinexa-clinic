"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { doctorsApi } from "@/lib/api";
import { SelectSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

interface DoctorOption {
  id: string;
  name: string;
  specialization: string | null;
}

interface DoctorFilterSelectProps {
  /** Owner scope: lists the clinic's doctors (GET /clinics/:id/doctors). */
  clinicId?: string | null;
  /** Staff scope: lists the branch's doctors (GET /branches/:id/doctors). Used when no clinicId. */
  branchId?: string | null;
  /** Selected doctor id, "" for all doctors. */
  value: string;
  onChange: (doctorId: string) => void;
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

/**
 * Searchable doctor combobox for appointment list filters. Loads the doctor
 * list once per scope and filters it client-side by name/specialization.
 */
export default function DoctorFilterSelect({ clinicId, branchId, value, onChange }: DoctorFilterSelectProps) {
  const { t } = useTranslation();
  const scopeKey = clinicId ? `c:${clinicId}` : branchId ? `b:${branchId}` : "";
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  // Scope whose doctor list has settled; shows a skeleton until then.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scopeKey) return;
    let active = true;
    const request = clinicId
      ? doctorsApi.listByClinic(clinicId).then((res) => res.items)
      : doctorsApi.listByBranch(branchId as string).then((res) => res.items);
    request
      .then((items) => {
        if (!active) return;
        const seen = new Set<string>();
        const options: DoctorOption[] = [];
        for (const d of items) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          options.push({ id: d.id, name: d.name, specialization: d.specialization });
        }
        options.sort((a, b) => a.name.localeCompare(b.name));
        setDoctors(options);
      })
      .catch(() => {
        if (active) setDoctors([]);
      })
      .finally(() => {
        if (active) setLoadedFor(scopeKey);
      });
    return () => {
      active = false;
    };
  }, [scopeKey, clinicId, branchId]);

  // Close the dropdown on any click outside the combobox.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = doctors.find((d) => d.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.specialization ?? "").toLowerCase().includes(q)
    );
  }, [doctors, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  if (scopeKey && loadedFor !== scopeKey) return <SelectSkeleton />;

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        value={open ? query : selected?.name ?? ""}
        placeholder={open ? t("appointments.searchDoctor") : t("appointments.allDoctors")}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            e.currentTarget.blur();
          } else if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[0].id);
          }
        }}
        className={`${inputClass} ${value ? "pr-8" : ""}`}
      />
      {value && !open && (
        <button
          type="button"
          onClick={() => pick("")}
          aria-label={t("appointments.allDoctors")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        >
          {!query.trim() && (
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${
                  value === "" ? "font-medium text-brand-500" : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {t("appointments.allDoctors")}
              </button>
            </li>
          )}
          {filtered.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => pick(d.id)}
                className={`block w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5 ${
                  d.id === value ? "font-medium text-brand-500" : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <span className="block text-sm">{d.name}</span>
                {d.specialization && (
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{d.specialization}</span>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t("appointments.noDoctorsMatch")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

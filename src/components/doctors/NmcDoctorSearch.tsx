"use client";
import React, { useState } from "react";

export interface NmcDoctorResult {
  year: number | null;
  registrationNo: string;
  council: string;
  name: string;
  fatherName: string | null;
  doctorId: string | null;
  qualification?: string | null;
  university?: string | null;
}

interface NmcDoctorSearchProps {
  onSelect: (doctor: NmcDoctorResult) => void;
  disabled?: boolean;
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function NmcDoctorSearch({
  onSelect,
  disabled,
}: NmcDoctorSearchProps) {
  const [registrationNo, setRegistrationNo] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState<NmcDoctorResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const regNo = registrationNo.trim();
    const nameQ = name.trim();
    if (!regNo && !nameQ) {
      setError("Enter a registration number or a doctor name.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/nmc/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationNo: regNo || undefined
        }),
      });
      const data = (await res.json()) as { results?: NmcDoctorResult[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "NMC search failed");
      }
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "NMC search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
        Verify doctor in the NMC registry
      </p>
      <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
        Search the Indian Medical Register by registration number or name, then
        use the result to prefill this form. Name search works best with a single
        keyword.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Reg. no
          </label>
          <input
            type="text"
            value={registrationNo}
            onChange={(e) => setRegistrationNo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            disabled={disabled || loading}
            className={inputClass}
          />
        </div>
        <button
          onClick={search}
          disabled={disabled || loading}
          className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}

      {results !== null && results.length === 0 && !error && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No doctors found in the NMC registry.
        </p>
      )}

      {results !== null && results.length > 0 && (
        <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
          {results.map((doc, i) => (
            <li
              key={`${doc.registrationNo}-${doc.council}-${i}`}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    {doc.name}
                  </p>
                  <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                    Reg. {doc.registrationNo} · {doc.council}
                    {doc.year ? ` · ${doc.year}` : ""}
                  </p>
                  {doc.qualification && (
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {doc.qualification}
                      {doc.university ? ` · ${doc.university}` : ""}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onSelect(doc)}
                  disabled={disabled}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                >
                  Use
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

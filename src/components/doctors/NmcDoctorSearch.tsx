"use client";
import React, { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction, useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";

export interface NmcDoctorResult {
  year: number | null;
  registrationNo: string;
  council: string;
  name: string;
  fatherName: string | null;
  doctorId: string | null;
  doctorDegree?: string | null;
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
  const { t } = useTranslation();
  const [registrationNo, setRegistrationNo] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState<NmcDoctorResult[] | null>(null);
  // The NMC search is rate-limited upstream: the lock guarantees a double
  // click / repeated Enter never fires a second request.
  const { pending: loading, run: runSearch } = useAsyncAction();
  const { begin, isLatest } = useLatestRequest();
  const [error, setError] = useState<string | null>(null);
  const selection = useKeyedAction<string>();

  const selectResult = async (doc: NmcDoctorResult, key: string) => {
    if (!doc.doctorId) {
      onSelect(doc);
      return;
    }
    await selection.run(key, async () => {
      try {
        const res = await fetch("/api/nmc/doctor-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doctorId: doc.doctorId,
            registrationNo: doc.registrationNo,
          }),
        });
        const data = (await res.json()) as {
          result?: { doctorDegree: string | null; university: string | null };
        };
        onSelect(
          res.ok && data.result
            ? { ...doc, doctorDegree: data.result.doctorDegree, university: data.result.university }
            : doc
        );
      } catch {
        onSelect(doc);
      }
    });
  };

  const search = async () => {
    const regNo = registrationNo.trim();
    const nameQ = name.trim();
    if (!regNo && !nameQ) {
      setError(t("nmcDoctorSearch.enterRegOrName"));
      return;
    }
    await runSearch(async () => {
      const token = begin();
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
          throw new Error(data.error || t("nmcDoctorSearch.searchFailed"));
        }
        if (!isLatest(token)) return;
        setResults(data.results ?? []);
      } catch (err) {
        if (!isLatest(token)) return;
        setError(err instanceof Error ? err.message : t("nmcDoctorSearch.searchFailed"));
      }
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
        {t("nmcDoctorSearch.verifyTitle")}
      </p>
      <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
        {t("nmcDoctorSearch.verifyDesc")}
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("nmcDoctorSearch.regNo")}
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
          type="button"
          onClick={search}
          disabled={disabled || loading}
          className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
        >
          {loading ? t("nmcDoctorSearch.searching") : t("nmcDoctorSearch.search")}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}

      {loading && (
        <ul className="mt-3 space-y-2" role="status" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <li
              key={i}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-2.5 w-3/4" />
                </div>
                <Skeleton className="h-7 w-12 shrink-0 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {results !== null && results.length === 0 && !error && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {t("nmcDoctorSearch.noDoctorsFound")}
        </p>
      )}

      {results !== null && results.length > 0 && (
        <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
          {results.map((doc, i) => {
            const key = `${doc.registrationNo}-${doc.council}-${i}`;
            const isSelecting = selection.isPending(key);
            return (
              <li
                key={key}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-800 text-theme-sm dark:text-white/90">
                      {doc.name}
                    </p>
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {t("nmcDoctorSearch.regPrefix", { no: doc.registrationNo, council: doc.council })}
                      {doc.year ? ` · ${doc.year}` : ""}
                    </p>
                    {doc.doctorDegree && (
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {doc.doctorDegree}
                        {doc.university ? ` · ${doc.university}` : ""}
                      </p>
                    )}
                  </div>
                  {/* While one result's details load, the other "Use" buttons wait too:
                   * two selections racing would prefill the form in arbitrary order. */}
                  <button
                    type="button"
                    onClick={() => selectResult(doc, key)}
                    disabled={disabled || selection.anyPending}
                    className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-500/10"
                  >
                    {isSelecting ? t("common.loading") : t("nmcDoctorSearch.use")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

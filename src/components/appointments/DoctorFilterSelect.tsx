"use client";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

export interface DoctorFilterOption {
  id: string;
  name: string;
}

interface DoctorFilterSelectProps {
  options: DoctorFilterOption[];
  /** Selected doctor id, or "" for all doctors. */
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  label?: string;
  disabled?: boolean;
}

/**
 * Single-select searchable doctor picker.
 *
 * `query` is what the input displays and `search` is what the list matches on.
 * They are kept separate on purpose: opening the dropdown clears only `search`,
 * so the box keeps showing the current selection while the list still offers
 * every doctor. Typing selects the input text, so it replaces rather than
 * appends.
 */
export default function DoctorFilterSelect({
  options,
  value,
  onChange,
  loading = false,
  label,
  disabled = false,
}: DoctorFilterSelectProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("appointments.doctor");
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep the box in step when the selection is changed from outside.
  useEffect(() => {
    setQuery(options.find((o) => o.id === value)?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.name.toLowerCase().includes(term));
  }, [options, search]);

  const commit = (id: string) => {
    onChange(id);
    setQuery(options.find((o) => o.id === id)?.name ?? "");
    setSearch("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const openList = () => {
    setOpen(true);
    setSearch("");
    setActiveIndex(-1);
    // Defer so the text is selected after the dropdown renders.
    setTimeout(() => inputRef.current?.select());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) {
        openList();
        return;
      }
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = activeIndex + step;
      setActiveIndex(next < 0 ? matches.length - 1 : next % matches.length);
      return;
    }
    if (e.key === "Enter") {
      // Only commit a highlighted row. This must not submit the surrounding
      // filter form - the Search button is what applies the filters.
      if (open && activeIndex >= 0) {
        e.preventDefault();
        const picked = matches[activeIndex];
        if (picked) commit(picked.id);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full sm:w-48">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {resolvedLabel}
      </label>

      <div className="relative flex h-11 items-center gap-2 rounded-lg border border-gray-300 pr-2 pl-3 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700">
        <svg
          className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled || loading}
          onFocus={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearch(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          placeholder={loading ? t("common.loading") : t("appointments.selectDoctor")}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          role="combobox"
          className="h-full w-full border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-0 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/90 dark:placeholder:text-gray-500"
        />
        {value && (
          <button
            type="button"
            onClick={() => commit("")}
            aria-label={t("appointments.allDoctors")}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <button
            type="button"
            onClick={() => commit("")}
            className={`block w-full px-3 py-2 text-left text-sm dark:text-gray-200 ${
              value === "" ? "bg-gray-100 dark:bg-white/[0.06]" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            }`}
          >
            {t("appointments.allDoctors")}
          </button>
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t("common.loading")}
            </div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t("common.noData")}
            </div>
          ) : (
            matches.map((o, i) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                onClick={() => commit(o.id)}
                className={`block w-full truncate px-3 py-2 text-left text-sm dark:text-gray-200 ${
                  i === activeIndex
                    ? "bg-gray-100 dark:bg-white/[0.06]"
                    : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                }`}
              >
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

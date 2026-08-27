"use client";
import React, { useEffect, useRef, useState } from "react";
import { ApiError, DoctorSpecialization, doctorSpecializationsApi } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

export interface SpecializationValue {
  id: string;
  name: string;
}

interface SpecializationPickerProps {
  value: SpecializationValue[];
  onChange: (value: SpecializationValue[]) => void;
  onBlur?: () => void;
  disabled?: boolean;
  max?: number;
  error?: boolean;
  hint?: string;
}

const SEARCH_DEBOUNCE_MS = 250;

export default function SpecializationPicker({
  value,
  onChange,
  onBlur,
  disabled,
  max = 10,
  error: hasRequiredError = false,
  hint,
}: SpecializationPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DoctorSpecialization[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const atMax = value.length >= max;

  useEffect(() => {
    let wasOpen = open;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (wasOpen) onBlur?.();
        wasOpen = false;
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open || atMax) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      doctorSpecializationsApi
        .list(query.trim() || undefined)
        .then((res) => {
          if (active) setOptions(res.items);
        })
        .catch(() => {
          if (active) setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, open, atMax]);

  const selectedIds = new Set(value.map((v) => v.id));
  const matches = options.filter((o) => !selectedIds.has(o.id));
  const trimmedQuery = query.trim();
  const exactMatch = options.some(
    (o) => o.name.toLowerCase() === trimmedQuery.toLowerCase()
  );

  const addExisting = (spec: DoctorSpecialization) => {
    onChange([...value, { id: spec.id, name: spec.name }]);
    setQuery("");
    setOptions([]);
  };

  const removeAt = (id: string) => {
    onChange(value.filter((v) => v.id !== id));
  };

  const createAndAdd = async () => {
    if (!trimmedQuery || creating) return;
    setCreating(true);
    setApiError(null);
    try {
      const spec = await doctorSpecializationsApi.create(trimmedQuery);
      addExisting(spec);
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : t("specializationPicker.couldNotAddSpecialization"));
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) {
        addExisting(matches[0]);
      } else if (trimmedQuery && !exactMatch) {
        createAndAdd();
      }
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      removeAt(value[value.length - 1].id);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 text-sm dark:bg-gray-900 ${
          hasRequiredError
            ? "border-error-500 dark:border-error-500"
            : "border-gray-300 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {value.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-theme-xs font-medium text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
          >
            {v.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeAt(v.id)}
                aria-label={t("specializationFilter.removeName", { name: v.name })}
                className="rounded-full p-0.5 hover:bg-brand-500/20"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1 1L9 9M9 1L1 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled || atMax}
          placeholder={value.length === 0 ? t("specializationPicker.searchPlaceholder") : ""}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-gray-800 outline-hidden placeholder:text-gray-400 dark:text-white/90"
        />
      </div>

      {atMax && (
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
          {t("specializationPicker.upToMax", { max })}
        </p>
      )}
      {apiError && (
        <p className="mt-1 text-theme-xs text-error-600 dark:text-error-400">{apiError}</p>
      )}
      {!apiError && hint && (
        <p className={`mt-1.5 text-xs ${hasRequiredError ? "text-error-500" : "text-gray-500"}`}>
          {hint}
        </p>
      )}

      {open && !atMax && !disabled && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{t("nmcDoctorSearch.searching")}</div>
          )}
          {!loading &&
            matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addExisting(m)}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.03]"
              >
                {m.name}
              </button>
            ))}
          {!loading && matches.length === 0 && !trimmedQuery && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t("specializationPicker.startTypingToSearch")}
            </div>
          )}
          {!loading && trimmedQuery && !exactMatch && (
            <button
              type="button"
              onClick={createAndAdd}
              disabled={creating}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M6 1V11M1 6H11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {creating ? t("doctors.adding") : t("specializationPicker.addQuery", { query: trimmedQuery })}
            </button>
          )}
          {!loading && matches.length === 0 && trimmedQuery && exactMatch && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t("specializationPicker.alreadySelected")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

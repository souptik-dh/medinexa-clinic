"use client";
import React, { useEffect } from "react";
import { usePincodeLookup, PostOffice } from "@/hooks/usePincodeLookup";
import { useTranslation } from "@/hooks/useTranslation";

interface PincodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (po: PostOffice) => void;
  onBlur?: () => void;
  disabled?: boolean;
  autoValidate?: boolean;
  error?: boolean;
  hint?: string;
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const inputErrorClass =
  "h-11 w-full rounded-lg border border-error-500 bg-transparent px-4 text-sm text-gray-800 focus:border-error-500 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 dark:border-error-500 dark:bg-gray-900 dark:text-error-400";

export default function PincodeField({
  value,
  onChange,
  onSelect,
  onBlur,
  disabled,
  autoValidate = true,
  error: hasError = false,
  hint,
}: PincodeFieldProps) {
  const { t } = useTranslation();
  const { results, loading, error, lookup, clear } = usePincodeLookup();

  useEffect(() => {
    if (autoValidate && value && value.trim().length === 6) {
      lookup(value.trim());
    } else {
      clear();
    }
  }, [autoValidate, value, lookup, clear]);

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onBlur={onBlur}
          disabled={disabled}
          className={hasError ? inputErrorClass : inputClass}
        />
        <button
          onClick={() => lookup(value)}
          disabled={loading || !value || disabled}
          className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {loading ? t("common.checkingEllipsis") : t("clinicForm.validate")}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-error-600">{error}</p>
      )}
      {!error && hint && (
        <p className={`mt-1.5 text-xs ${hasError ? "text-error-500" : "text-gray-500"}`}>{hint}</p>
      )}
      {results.length > 0 && (
        <div className="mt-2 max-h-40 overflow-auto rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
          {results.map((po) => (
            <button
              key={po.Name + po.BranchType + po.District}
              onClick={() => {
                onSelect(po);
                clear();
              }}
              className="w-full text-left px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            >
              <div className="font-medium">{po.Name}</div>
              <div className="text-xs text-gray-500">
                {po.BranchType} — {po.District}, {po.State}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import React from "react";
import FieldError from "@/components/form/FieldError";
import { getInputClass } from "@/components/form/fieldStyles";
import { sanitizePhoneDigits, PHONE_VALIDATION_MESSAGE } from "@/lib/phone";

interface PhoneNumberFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
}

export default function PhoneNumberField({
  value,
  onChange,
  onBlur,
  error = false,
  disabled = false,
  id,
  name,
  placeholder = "10-digit mobile number",
}: PhoneNumberFieldProps) {
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-[22px] -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          id={id}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(sanitizePhoneDigits(e.target.value))}
          onBlur={onBlur}
          disabled={disabled}
          className={`${getInputClass(error)} pl-12`}
        />
      </div>
      {error && <FieldError message={PHONE_VALIDATION_MESSAGE} />}
    </div>
  );
}

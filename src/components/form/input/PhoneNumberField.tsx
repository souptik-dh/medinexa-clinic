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
        className={getInputClass(error)}
      />
      {error && <FieldError message={PHONE_VALIDATION_MESSAGE} />}
    </div>
  );
}

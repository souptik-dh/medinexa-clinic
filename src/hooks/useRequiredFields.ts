"use client";

import { useCallback, useState } from "react";

export const REQUIRED_FIELD_MESSAGE = "This field is required.";

/**
 * Tracks per-field "touched" state plus a form-wide "submitted" flag so a
 * required field's error only shows after the user has interacted with it
 * (blur) or attempted to submit — never while they're still typing it for
 * the first time.
 */
export function useRequiredFields<F extends string>() {
  const [touched, setTouched] = useState<Partial<Record<F, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const touch = useCallback((field: F) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const showError = useCallback(
    (field: F, isEmpty: boolean) => isEmpty && (submitted || !!touched[field]),
    [submitted, touched]
  );

  return { touch, showError, submitted, setSubmitted };
}

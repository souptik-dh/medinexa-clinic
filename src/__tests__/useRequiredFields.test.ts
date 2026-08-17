import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRequiredFields, REQUIRED_FIELD_MESSAGE } from "@/hooks/useRequiredFields";

describe("useRequiredFields", () => {
  it("initializes with empty touched state", () => {
    const { result } = renderHook(() => useRequiredFields());
    expect(result.current.submitted).toBe(false);
  });

  it("touch marks a field as touched", () => {
    const { result } = renderHook(() => useRequiredFields());
    act(() => {
      result.current.touch("email");
    });
    // After touching, showError should return true when field is empty
    expect(result.current.showError("email", true)).toBe(true);
    expect(result.current.showError("email", false)).toBe(false);
  });

  it("showError returns false for untouched field when not submitted", () => {
    const { result } = renderHook(() => useRequiredFields());
    expect(result.current.showError("email", true)).toBe(false);
  });

  it("showError returns true for empty field when submitted", () => {
    const { result } = renderHook(() => useRequiredFields());
    act(() => {
      result.current.setSubmitted(true);
    });
    expect(result.current.showError("email", true)).toBe(true);
  });

  it("showError returns false for non-empty field when submitted", () => {
    const { result } = renderHook(() => useRequiredFields());
    act(() => {
      result.current.setSubmitted(true);
    });
    expect(result.current.showError("email", false)).toBe(false);
  });

  it("touch is idempotent", () => {
    const { result } = renderHook(() => useRequiredFields());
    act(() => {
      result.current.touch("email");
      result.current.touch("email");
    });
    expect(result.current.showError("email", true)).toBe(true);
  });

  it("REQUIRED_FIELD_MESSAGE is defined", () => {
    expect(REQUIRED_FIELD_MESSAGE).toBe("This field is required.");
  });
});

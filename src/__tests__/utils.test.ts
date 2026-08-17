import { describe, it, expect, vi } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  timeAgo,
  appointmentStatusColor,
  appointmentStatusLabel,
  relationshipLabel,
  notificationTypeLabel,
  notificationLink,
  inviteStatusColor,
  inviteStatusLabel,
  today,
  formatFullAddress,
  downloadBlob,
  type InviteStatus,
} from "@/lib/utils";
import type { AppointmentStatus, NotificationType } from "@/lib/api";

describe("formatCurrency", () => {
  it("formats INR currency by default", () => {
    const result = formatCurrency(1500);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/500/);
  });

  it("formats zero amount", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0/);
  });

  it("formats negative amounts", () => {
    const result = formatCurrency(-500);
    expect(result).toMatch(/500/);
  });

  it("formats large amounts", () => {
    const result = formatCurrency(1234567);
    expect(result).toMatch(/12/);
    expect(result).toMatch(/34/);
    expect(result).toMatch(/567/);
  });

  it("handles custom currency", () => {
    const result = formatCurrency(100, "USD");
    expect(result).toMatch(/100/);
  });

  it("falls back for invalid currency", () => {
    const result = formatCurrency(100, "INVALID");
    expect(result).toBe("INVALID 100");
  });
});

describe("formatDate", () => {
  it("returns dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("formats a valid ISO date", () => {
    const result = formatDate("2024-01-15T00:00:00Z");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats date with time component", () => {
    const result = formatDate("2024-06-20T14:30:00Z");
    expect(result).toContain("20");
    expect(result).toContain("2024");
  });
});

describe("formatDateTime", () => {
  it("returns dash for empty string", () => {
    expect(formatDateTime("")).toBe("—");
  });

  it("formats a valid ISO datetime", () => {
    const result = formatDateTime("2024-01-15T10:30:00Z");
    expect(result).toContain("15");
    expect(result).toContain("2024");
    // Output is locale-dependent; just verify it has time and date parts
    expect(result).toContain("2024");
    expect(result.length).toBeGreaterThan(10);
  });
});

describe("timeAgo", () => {
  it("returns dash for empty string", () => {
    expect(timeAgo("")).toBe("—");
  });

  it("returns 'just now' for very recent timestamps", () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5 min ago");
  });

  it("returns hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(threeHoursAgo)).toBe("3 hr ago");
  });

  it("returns days ago", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fiveDaysAgo)).toBe("5 days ago");
  });

  it("returns singular 'day ago' for 1 day", () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneDayAgo)).toBe("1 day ago");
  });

  it("returns formatted date for > 30 days", () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = timeAgo(sixtyDaysAgo);
    // Should fall back to formatDate
    expect(result).not.toContain("ago");
  });

  it("returns formatted date for future timestamps instead of 'just now'", () => {
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();
    const result = timeAgo(futureDate);
    // Should NOT return "just now" for future dates
    expect(result).not.toBe("just now");
    // Should fall back to formatDate
    expect(result).not.toContain("ago");
  });
});

describe("appointmentStatusColor", () => {
  const cases: [AppointmentStatus, string][] = [
    ["pending", "warning"],
    ["confirmed", "info"],
    ["paid", "primary"],
    ["completed", "success"],
    ["cancelled", "error"],
    ["no_show", "dark"],
  ];

  it.each(cases)("maps %s to %s", (status, expected) => {
    expect(appointmentStatusColor(status)).toBe(expected);
  });

  it("returns light for unknown status", () => {
    expect(appointmentStatusColor("unknown" as AppointmentStatus)).toBe("light");
  });
});

describe("appointmentStatusLabel", () => {
  it("capitalizes status names", () => {
    expect(appointmentStatusLabel("pending")).toBe("Pending");
    expect(appointmentStatusLabel("confirmed")).toBe("Confirmed");
    expect(appointmentStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("formats no_show specially", () => {
    expect(appointmentStatusLabel("no_show")).toBe("No show");
  });

  it("capitalizes paid", () => {
    expect(appointmentStatusLabel("paid")).toBe("Paid");
  });

  it("capitalizes completed", () => {
    expect(appointmentStatusLabel("completed")).toBe("Completed");
  });
});

describe("relationshipLabel", () => {
  it("formats 'self' specially", () => {
    expect(relationshipLabel("self")).toBe("Self");
  });

  it("capitalizes other relationships", () => {
    expect(relationshipLabel("spouse")).toBe("Spouse");
    expect(relationshipLabel("child")).toBe("Child");
    expect(relationshipLabel("parent")).toBe("Parent");
    expect(relationshipLabel("sibling")).toBe("Sibling");
    expect(relationshipLabel("friend")).toBe("Friend");
    expect(relationshipLabel("other")).toBe("Other");
  });
});

describe("notificationTypeLabel", () => {
  it("capitalizes single words", () => {
    expect(notificationTypeLabel("pending")).toBe("Pending");
  });

  it("handles underscore-separated words", () => {
    expect(notificationTypeLabel("new_booking")).toBe("New Booking");
    expect(notificationTypeLabel("booking_confirmed")).toBe("Booking Confirmed");
    expect(notificationTypeLabel("payment_received")).toBe("Payment Received");
    expect(notificationTypeLabel("consultation_completed")).toBe("Consultation Completed");
    expect(notificationTypeLabel("prescription_ready")).toBe("Prescription Ready");
    expect(notificationTypeLabel("doctor_invited")).toBe("Doctor Invited");
    expect(notificationTypeLabel("doctor_invite_accepted")).toBe("Doctor Invite Accepted");
    expect(notificationTypeLabel("appointment_cancelled")).toBe("Appointment Cancelled");
  });
});

describe("notificationLink", () => {
  const cases: [NotificationType, string][] = [
    ["new_booking", "/appointments"],
    ["booking_confirmed", "/appointments"],
    ["appointment_cancelled", "/appointments"],
    ["consultation_completed", "/appointments"],
    ["payment_received", "/ledger"],
    ["prescription_ready", "/prescriptions"],
    ["doctor_invited", "/doctors/invite"],
    ["doctor_invite_accepted", "/doctors"],
  ];

  it.each(cases)("maps %s to %s", (type, expected) => {
    expect(notificationLink(type)).toBe(expected);
  });

  it("returns /dashboard for unknown type", () => {
    expect(notificationLink("unknown" as NotificationType)).toBe("/dashboard");
  });
});

describe("inviteStatusColor", () => {
  it("maps pending to warning", () => {
    expect(inviteStatusColor("pending")).toBe("warning");
  });

  it("maps accepted to success", () => {
    expect(inviteStatusColor("accepted")).toBe("success");
  });

  it("maps expired to dark", () => {
    expect(inviteStatusColor("expired")).toBe("dark");
  });

  it("maps revoked to error", () => {
    expect(inviteStatusColor("revoked")).toBe("error");
  });

  it("returns light for unknown", () => {
    expect(inviteStatusColor("unknown" as InviteStatus)).toBe("light");
  });
});

describe("inviteStatusLabel", () => {
  it("capitalizes status names", () => {
    expect(inviteStatusLabel("pending")).toBe("Pending");
    expect(inviteStatusLabel("accepted")).toBe("Accepted");
    expect(inviteStatusLabel("expired")).toBe("Expired");
    expect(inviteStatusLabel("revoked")).toBe("Revoked");
  });
});

describe("today", () => {
  it("returns ISO date string format YYYY-MM-DD", () => {
    const result = today();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date", () => {
    const result = today();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    expect(result).toBe(`${year}-${month}-${day}`);
  });
});

describe("formatFullAddress", () => {
  it("joins non-null fields with newlines", () => {
    const result = formatFullAddress({
      address: "123 Main St",
      city: "Mumbai",
      state: "Maharashtra",
    });
    expect(result).toBe("Address: 123 Main St\nCity: Mumbai\nState: Maharashtra");
  });

  it("skips null/undefined fields", () => {
    const result = formatFullAddress({
      address: "123 Main St",
      city: null,
      state: undefined,
    });
    expect(result).toBe("Address: 123 Main St");
  });

  it("returns empty string when all fields are null", () => {
    const result = formatFullAddress({
      address: null,
      city: null,
      state: null,
    });
    expect(result).toBe("");
  });

  it("includes all fields when all are provided", () => {
    const result = formatFullAddress({
      address: "123 Main St",
      nearby_location: "Near Park",
      city: "Mumbai",
      district: "Mumbai City",
      state: "Maharashtra",
      post_office: "Fort",
      pin_code: "400001",
    });
    const lines = result.split("\n");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe("Address: 123 Main St");
    expect(lines[6]).toBe("Pincode: 400001");
  });
});

describe("downloadBlob", () => {
  it("creates anchor element, clicks it, and cleans up", () => {
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemove = vi.fn();
    const mockRevokeObjectURL = vi.fn();
    const mockCreateObjectURL = vi.fn(() => "blob:mock-url");

    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        href: "",
        download: "",
        click: mockClick,
        remove: mockRemove,
      })),
      body: {
        appendChild: mockAppendChild,
      },
    });

    const blob = new Blob(["test"], { type: "text/plain" });
    downloadBlob(blob, "test.txt");

    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    expect(mockAppendChild).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    vi.unstubAllGlobals();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTimeKeyInTz, hasSlotEndedInTz } from "../../api/src/lib/availability";

// Pins "now" to an instant given in UTC.
function at(isoUtc: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoUtc));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("hasSlotEndedInTz", () => {
  // 2026-10-08 10:29:59 in Asia/Kolkata (UTC+05:30)
  it("keeps a slot bookable until the last second before its end", () => {
    at("2026-10-08T04:59:59Z");
    expect(hasSlotEndedInTz("2026-10-08", "10:00", 30, "Asia/Kolkata")).toBe(false);
  });

  it("closes a slot at its exact end time", () => {
    at("2026-10-08T05:00:00Z"); // 10:30:00 IST
    expect(hasSlotEndedInTz("2026-10-08", "10:00", 30, "Asia/Kolkata")).toBe(true);
  });

  it("keeps a slot that has started but not ended bookable", () => {
    at("2026-10-08T04:45:00Z"); // 10:15 IST
    expect(hasSlotEndedInTz("2026-10-08", "10:00", 30, "Asia/Kolkata")).toBe(false);
  });

  it("uses the branch timezone, not UTC", () => {
    // 05:00 UTC = 10:30 IST = 11:00 Dhaka. The 10:00-10:45 slot ended in Dhaka only.
    at("2026-10-08T05:00:00Z");
    expect(hasSlotEndedInTz("2026-10-08", "10:00", 45, "Asia/Kolkata")).toBe(false);
    expect(hasSlotEndedInTz("2026-10-08", "10:00", 45, "Asia/Dhaka")).toBe(true);
  });

  it("uses the branch's date when UTC is still on the previous day", () => {
    // 2026-10-07 20:00 UTC = 2026-10-08 01:30 IST — "today" is the 8th in the branch.
    at("2026-10-07T20:00:00Z");
    expect(hasSlotEndedInTz("2026-10-08", "01:00", 15, "Asia/Kolkata")).toBe(true);
    expect(hasSlotEndedInTz("2026-10-08", "09:00", 15, "Asia/Kolkata")).toBe(false);
  });

  it("treats past dates as ended and future dates as open", () => {
    at("2026-10-08T05:00:00Z");
    expect(hasSlotEndedInTz("2026-10-07", "23:00", 30, "Asia/Kolkata")).toBe(true);
    expect(hasSlotEndedInTz("2026-10-09", "00:00", 15, "Asia/Kolkata")).toBe(false);
  });

  it("does not end a slot that runs past midnight on its own day", () => {
    at("2026-10-08T18:25:00Z"); // 23:55 IST
    expect(hasSlotEndedInTz("2026-10-08", "23:45", 30, "Asia/Kolkata")).toBe(false);
  });
});

describe("currentTimeKeyInTz", () => {
  it("renders midnight as 00:xx, never 24:xx", () => {
    at("2026-10-07T18:35:00Z"); // 00:05 IST
    expect(currentTimeKeyInTz("Asia/Kolkata")).toBe("00:05");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAssignableLabTime,
  assertLabDateBookable,
  generateLabTestSlots,
} from "../../api/src/lib/lab-test-availability";

// ── In-memory stand-in for lab_test_schedules / branch_closures / lab_test_appointments ──
interface Window { weekday: number; start_time: string; end_time: string }
interface Booking { id: string; date: string; start_time: string | null; end_time: string | null; status: string }

function fakeDb(opts: { windows?: Window[]; closures?: string[]; bookings?: Booking[] }) {
  const windows = opts.windows ?? [];
  const closures = opts.closures ?? [];
  const bookings = opts.bookings ?? [];
  const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
  const active = (b: Booking) => !["CANCELLED", "REJECTED"].includes(b.status) && b.start_time && b.end_time;
  return {
    async query(sqlRaw: string, params: unknown[] = []) {
      const sql = norm(sqlRaw);
      const p = params as (string | number)[];
      if (sql.startsWith("SELECT start_time, end_time FROM lab_test_schedules")) {
        return [windows.filter((w) => w.weekday === p[1])];
      }
      if (sql.startsWith("SELECT id FROM branch_closures")) {
        return [closures.includes(String(p[1])) ? [{ id: "c1" }] : []];
      }
      if (sql.startsWith("SELECT start_time, end_time FROM lab_test_appointments")) {
        // generate: [branch, test, date, excludeId]; assignable: [branch, test, date, id]
        return [bookings.filter((b) => b.date === p[2] && b.id !== p[3] && active(b))];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  } as never;
}

const TZ = "Asia/Kolkata";
// 2026-10-12 is a Monday (weekday 1). Clock: 2026-10-12 10:05 IST.
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const mondayHours = [{ weekday: 1, start_time: "09:00:00", end_time: "11:00:00" }];
const tuesdayHours = [{ weekday: 2, start_time: "09:00:00", end_time: "11:00:00" }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T04:35:00Z")); // 10:05 IST
});
afterEach(() => vi.useRealTimers());

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe("generateLabTestSlots", () => {
  it("ignores bookings that have no time yet (pending, awaiting the clinic)", async () => {
    const db = fakeDb({
      windows: tuesdayHours,
      bookings: [{ id: "a", date: TUESDAY, start_time: null, end_time: null, status: "PENDING" }],
    });
    const slots = await generateLabTestSlots(db, "b", "t", TUESDAY, 30, TZ);
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.available)).toBe(true);
  });
});

describe("assertLabDateBookable (booking picks a date only)", () => {
  it("accepts a date with lab hours and free time", async () => {
    expect(await code(assertLabDateBookable(fakeDb({ windows: tuesdayHours }), "b", "t", TUESDAY, 30, TZ))).toBeNull();
  });

  it("rejects a day without lab hours, or a closure", async () => {
    expect(await code(assertLabDateBookable(fakeDb({ windows: mondayHours }), "b", "t", TUESDAY, 30, TZ))).toBe("OUTSIDE_SCHEDULE");
    expect(
      await code(assertLabDateBookable(fakeDb({ windows: tuesdayHours, closures: [TUESDAY] }), "b", "t", TUESDAY, 30, TZ)),
    ).toBe("OUTSIDE_SCHEDULE");
  });

  it("today: open while a slot can still end in the future, closed once the last one has", async () => {
    // 10:05 IST — the 10:30-11:00 slot is still ahead.
    expect(await code(assertLabDateBookable(fakeDb({ windows: mondayHours }), "b", "t", MONDAY, 30, TZ))).toBeNull();
    vi.setSystemTime(new Date("2026-10-12T05:30:00Z")); // 11:00 IST — every slot has ended
    expect(await code(assertLabDateBookable(fakeDb({ windows: mondayHours }), "b", "t", MONDAY, 30, TZ))).toBe(
      "BOOKING_TIME_ENDED",
    );
  });

  it("rejects a date where every time is already assigned to confirmed bookings", async () => {
    const bookings: Booking[] = [
      ["09:00", "09:30"],
      ["09:30", "10:00"],
      ["10:00", "10:30"],
      ["10:30", "11:00"],
    ].map(([start_time, end_time], i) => ({ id: `x${i}`, date: TUESDAY, start_time, end_time, status: "APPROVED" }));
    expect(await code(assertLabDateBookable(fakeDb({ windows: tuesdayHours, bookings }), "b", "t", TUESDAY, 30, TZ))).toBe(
      "DATE_FULLY_BOOKED",
    );
  });
});

describe("assertAssignableLabTime (clinic assigns the time on confirm)", () => {
  const appt = (date: string) => ({ id: "me", branch_id: "b", branch_lab_test_id: "t", appointment_date: date, duration_minutes: 30 });

  it("accepts a time inside the lab hours and returns start/end", async () => {
    await expect(assertAssignableLabTime(fakeDb({ windows: tuesdayHours }), appt(TUESDAY), "09:15", TZ)).resolves.toEqual({
      start: "09:15",
      end: "09:45",
    });
  });

  it("rejects a time outside the hours, or one that would run past closing", async () => {
    expect(await code(assertAssignableLabTime(fakeDb({ windows: tuesdayHours }), appt(TUESDAY), "08:30", TZ))).toBe(
      "OUTSIDE_SCHEDULE",
    );
    expect(await code(assertAssignableLabTime(fakeDb({ windows: tuesdayHours }), appt(TUESDAY), "10:45", TZ))).toBe(
      "OUTSIDE_SCHEDULE",
    );
  });

  it("rejects a time that has already passed today", async () => {
    expect(await code(assertAssignableLabTime(fakeDb({ windows: mondayHours }), appt(MONDAY), "09:00", TZ))).toBe("TIME_IN_PAST");
    expect(await code(assertAssignableLabTime(fakeDb({ windows: mondayHours }), appt(MONDAY), "10:30", TZ))).toBeNull();
  });

  it("rejects a time overlapping another booking of the test, but not the booking's own", async () => {
    const bookings: Booking[] = [
      { id: "other", date: TUESDAY, start_time: "09:00", end_time: "09:30", status: "APPROVED" },
      { id: "me", date: TUESDAY, start_time: "10:00", end_time: "10:30", status: "PENDING" },
    ];
    expect(await code(assertAssignableLabTime(fakeDb({ windows: tuesdayHours, bookings }), appt(TUESDAY), "09:15", TZ))).toBe(
      "SLOT_NOT_AVAILABLE",
    );
    expect(await code(assertAssignableLabTime(fakeDb({ windows: tuesdayHours, bookings }), appt(TUESDAY), "10:00", TZ))).toBeNull();
  });
});

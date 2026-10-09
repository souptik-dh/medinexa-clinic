import type { Pool, RowDataPacket } from "mysql2/promise";
import { hasSlotEndedInTz, todayInTz } from "@api/lib/availability";
import { conflict, unprocessable } from "@api/lib/errors";

type Db = Pool;
type Row = RowDataPacket;

interface TimeSlot {
  start: string;
  end: string;
  /** True once the slot's end has passed today in the branch's tz — never bookable. */
  ended: boolean;
  available: boolean;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The lab's working grid for a date: the branch's lab schedule windows stepped by the
 * test duration. `[]` = no lab hours that day (no active schedule, or a branch closure).
 * Only bookings that already have a time (assigned by the clinic on confirm, or an older
 * patient-chosen one) block a slot — a pending booking without a time blocks nothing.
 * `excludeAppointmentId` leaves one booking out (re-assigning that booking's own time).
 */
export async function generateLabTestSlots(
  db: Db,
  branchId: string,
  branchTestId: string,
  date: string,
  durationMinutes: number,
  tz: string,
  excludeAppointmentId: string | null = null,
): Promise<TimeSlot[]> {
  const dateObj = new Date(date + "T00:00:00Z");
  const weekday = dateObj.getUTCDay();

  const [scheduleRows] = await db.query<Row[]>(
    `SELECT start_time, end_time FROM lab_test_schedules
     WHERE branch_id = ? AND weekday = ? AND is_active = 1`,
    [branchId, weekday],
  );

  if (scheduleRows.length === 0) return [];

  const [closureRows] = await db.query<Row[]>(
    `SELECT id FROM branch_closures
     WHERE branch_id = ? AND status = 'active' AND start_date <= ? AND end_date >= ?`,
    [branchId, date, date],
  );
  if (closureRows.length > 0) return [];

  const [apptRows] = await db.query<Row[]>(
    `SELECT start_time, end_time FROM lab_test_appointments
     WHERE branch_id = ? AND branch_lab_test_id = ? AND appointment_date = ?
       AND status NOT IN ('CANCELLED', 'REJECTED')
       AND start_time IS NOT NULL AND end_time IS NOT NULL
       AND id <> ?`,
    [branchId, branchTestId, date, excludeAppointmentId ?? ""],
  );

  const bookedRanges = apptRows.map((r) => ({
    start: timeToMinutes(r.start_time),
    end: timeToMinutes(r.end_time),
  }));

  const slots: TimeSlot[] = [];

  for (const sched of scheduleRows) {
    const schedStart = timeToMinutes(String(sched.start_time).slice(0, 5));
    const schedEnd = timeToMinutes(String(sched.end_time).slice(0, 5));

    for (let t = schedStart; t + durationMinutes <= schedEnd; t += durationMinutes) {
      const slotStart = t;
      const slotEnd = t + durationMinutes;

      const isBooked = bookedRanges.some(
        (b) => slotStart < b.end && slotEnd > b.start,
      );

      const start = minutesToTime(slotStart);
      const ended = hasSlotEndedInTz(date, start, durationMinutes, tz);

      slots.push({
        start,
        end: minutesToTime(slotEnd),
        ended,
        available: !isBooked && !ended,
      });
    }
  }

  return slots;
}

export const LAB_DATE_ERRORS = {
  OUTSIDE_SCHEDULE: "Lab tests are not available at this branch on the selected date.",
  BOOKING_TIME_ENDED: "Booking for today has closed — the lab's hours for today have ended.",
  DATE_FULLY_BOOKED: "No test times are left on the selected date. Please choose another date.",
} as const;

/**
 * A new lab booking picks a date only (the clinic assigns the time on confirm), so the
 * date itself must still be bookable: lab hours that day, not after today's last slot
 * has ended (branch tz), and at least one time not yet taken by a confirmed booking.
 * Past dates are rejected by the caller first.
 */
export async function assertLabDateBookable(
  db: Db,
  branchId: string,
  branchTestId: string,
  date: string,
  durationMinutes: number,
  tz: string,
): Promise<void> {
  const slots = await generateLabTestSlots(db, branchId, branchTestId, date, durationMinutes, tz);
  if (slots.length === 0) {
    throw unprocessable("OUTSIDE_SCHEDULE", LAB_DATE_ERRORS.OUTSIDE_SCHEDULE, "appointment_date");
  }
  if (slots.every((s) => s.ended)) {
    throw unprocessable("BOOKING_TIME_ENDED", LAB_DATE_ERRORS.BOOKING_TIME_ENDED, "appointment_date");
  }
  if (!slots.some((s) => s.available)) {
    throw conflict("DATE_FULLY_BOOKED", LAB_DATE_ERRORS.DATE_FULLY_BOOKED);
  }
}

/**
 * The time a clinic assigns when confirming a booking: the whole test (start + duration)
 * must fit inside one of the branch's lab schedule windows for that date (no closure),
 * must not have already ended today in the branch's tz, and must not overlap another
 * booking of the same test that already has a time.
 */
export async function assertAssignableLabTime(
  db: Db,
  appt: { id: string; branch_id: string; branch_lab_test_id: string; appointment_date: string; duration_minutes: number },
  startTime: string,
  tz: string,
): Promise<{ start: string; end: string }> {
  const duration = Number(appt.duration_minutes);
  const start = timeToMinutes(startTime);
  const end = start + duration;
  if (!Number.isFinite(start) || start < 0 || end > 24 * 60) {
    throw unprocessable("OUTSIDE_SCHEDULE", "The selected time is outside the lab's working hours for this date.", "start_time");
  }

  if (appt.appointment_date < todayInTz(tz) || hasSlotEndedInTz(appt.appointment_date, startTime, duration, tz)) {
    throw unprocessable("TIME_IN_PAST", "The selected time has already passed. Choose a later time.", "start_time");
  }

  // Same source as the booking grid: schedules for the weekday, minus closures.
  const slots = await generateLabTestSlots(
    db, appt.branch_id, appt.branch_lab_test_id, appt.appointment_date, duration, tz, appt.id,
  );
  if (slots.length === 0) {
    throw unprocessable("OUTSIDE_SCHEDULE", "The lab is not open on this booking's date.", "start_time");
  }
  const weekday = new Date(appt.appointment_date + "T00:00:00Z").getUTCDay();
  const [windows] = await db.query<Row[]>(
    `SELECT start_time, end_time FROM lab_test_schedules
     WHERE branch_id = ? AND weekday = ? AND is_active = 1`,
    [appt.branch_id, weekday],
  );
  const fits = windows.some(
    (w) => start >= timeToMinutes(String(w.start_time).slice(0, 5)) && end <= timeToMinutes(String(w.end_time).slice(0, 5)),
  );
  if (!fits) {
    throw unprocessable("OUTSIDE_SCHEDULE", "The selected time is outside the lab's working hours for this date.", "start_time");
  }

  const [taken] = await db.query<Row[]>(
    `SELECT start_time, end_time FROM lab_test_appointments
     WHERE branch_id = ? AND branch_lab_test_id = ? AND appointment_date = ? AND id <> ?
       AND status NOT IN ('CANCELLED', 'REJECTED')
       AND start_time IS NOT NULL AND end_time IS NOT NULL`,
    [appt.branch_id, appt.branch_lab_test_id, appt.appointment_date, appt.id],
  );
  if (taken.some((t) => start < timeToMinutes(String(t.end_time)) && end > timeToMinutes(String(t.start_time)))) {
    throw conflict(
      "SLOT_NOT_AVAILABLE",
      "This time is already assigned to another confirmed booking for this test. Choose another time.",
    );
  }

  return { start: minutesToTime(start), end: minutesToTime(end) };
}

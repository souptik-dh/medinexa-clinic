// Seeds appointment_reminders with the reminders still due for current bookings, as
// 'scheduled' rows: for every confirmed/paid doctor appointment and APPROVED lab test
// appointment, one row per day in the 3 days before the visit, from today (branch
// timezone) onward. Mirrors the rules in src/lib/appointment-reminders.ts — no reminder
// on the day the booking was made — so the rows match what the cron will send. The
// cron flips each row to 'sent' when it delivers it.
//
// Safe to re-run: the existing scheduled plan is rebuilt from scratch (so cancelled or
// rescheduled bookings drop out), and reminders already sent are never touched.
import { createConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

const REMINDER_DAYS_BEFORE = 3;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env api/scripts/seed-appointment-reminders.mjs');
  process.exit(1);
}

const conn = await createConnection({ uri: url, dateStrings: true, timezone: 'Z' });

function dateInTz(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// DATETIME strings come back as UTC "YYYY-MM-DD HH:mm:ss.SSS" (see parseDbTimestamp).
function parseDbTimestamp(value) {
  return new Date(`${String(value).replace(' ', 'T')}Z`);
}

function plannedRows(kind, bookings, dateKey) {
  const rows = [];
  for (const b of bookings) {
    const tz = String(b.branch_timezone);
    const today = dateInTz(new Date(), tz);
    const createdOn = dateInTz(parseDbTimestamp(b.created_at), tz);
    const visit = String(b[dateKey]).slice(0, 10);
    for (let daysBefore = 1; daysBefore <= REMINDER_DAYS_BEFORE; daysBefore++) {
      const reminderDate = addDays(visit, -daysBefore);
      if (reminderDate < today || reminderDate === createdOn) continue;
      rows.push([randomUUID(), kind, b.id, reminderDate, daysBefore, 'scheduled', null]);
    }
  }
  return rows;
}

try {
  // Branch-local "today" is never more than a day off UTC, so this window covers every
  // booking that can still have a reminder due.
  const [doctorBookings] = await conn.query(
    `SELECT a.id, a.scheduled_date, a.created_at, b.timezone AS branch_timezone
       FROM appointments a JOIN branches b ON b.id = a.branch_id
      WHERE a.status IN ('confirmed', 'paid') AND a.scheduled_date >= UTC_DATE()`,
  );
  const [labBookings] = await conn.query(
    `SELECT a.id, a.appointment_date, a.created_at, b.timezone AS branch_timezone
       FROM lab_test_appointments a JOIN branches b ON b.id = a.branch_id
      WHERE a.status = 'APPROVED' AND a.appointment_date >= UTC_DATE()`,
  );

  const rows = [
    ...plannedRows('doctor', doctorBookings, 'scheduled_date'),
    ...plannedRows('lab', labBookings, 'appointment_date'),
  ];

  await conn.beginTransaction();
  const [cleared] = await conn.query(`DELETE FROM appointment_reminders WHERE status = 'scheduled'`);
  let inserted = 0;
  if (rows.length > 0) {
    // IGNORE keeps any reminder the cron already sent for the same appointment and day.
    const [result] = await conn.query(
      `INSERT IGNORE INTO appointment_reminders
         (id, appointment_kind, appointment_id, reminder_date, days_before, status, sent_at)
       VALUES ?`,
      [rows],
    );
    inserted = result.affectedRows;
  }
  await conn.commit();

  console.log(
    `Bookings: ${doctorBookings.length} doctor, ${labBookings.length} lab. ` +
      `Cleared ${cleared.affectedRows} old scheduled row(s); scheduled ${inserted} reminder(s)` +
      (rows.length > inserted ? ` (${rows.length - inserted} already sent, kept as-is).` : '.'),
  );
} catch (err) {
  await conn.rollback().catch(() => {});
  throw err;
} finally {
  await conn.end();
}

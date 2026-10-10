import type { Pool } from "mysql2/promise";
import { pool as defaultPool, parseDbTimestamp, type Row } from "@api/lib/db";
import { newId } from "@api/lib/ids";
import { todayInTz } from "@api/lib/availability";
import { loadAppointmentPrecautions, precautionLines } from "@api/lib/lab-test-precautions";
import {
  createPatientNotification,
  detailsEmailHtml,
  patientRecipient,
  pushContentFor,
  sendEmail,
  type NotificationType,
} from "@api/lib/notifications";

// Daily patient reminders for upcoming doctor and lab appointments: push + in-app +
// email on each of the REMINDER_DAYS_BEFORE days leading up to the visit (so a booking
// made well ahead gets one every day for the last 3 days, and a short-notice booking
// still gets the day-before one). Only confirmed bookings are reminded — a pending one
// may yet be rejected or lapse. Bookings made today are skipped; the patient was just
// notified. "Today" is the branch's date, never the server's. Each send is claimed in
// appointment_reminders first, so the cron is safe to run many times a day.
const REMINDER_DAYS_BEFORE = 3;
const BATCH_LIMIT = 2000;

export interface ReminderSweepResult {
  doctorReminders: number;
  labTestReminders: number;
}

export async function processAppointmentReminders(
  poolDb: Pool = defaultPool,
): Promise<ReminderSweepResult> {
  return {
    doctorReminders: await remindDoctorAppointments(poolDb),
    labTestReminders: await remindLabTestAppointments(poolDb),
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function dateInTz(timestamp: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(parseDbTimestamp(timestamp));
}

/** Days until the visit when a reminder is due today (branch tz), else null. */
function reminderDaysBefore(row: Row, date: string): { today: string; daysBefore: number } | null {
  const tz = String(row.branch_timezone);
  const today = todayInTz(tz);
  const daysBefore = daysBetween(today, date);
  if (daysBefore < 1 || daysBefore > REMINDER_DAYS_BEFORE) return null;
  if (row.created_at && dateInTz(String(row.created_at), tz) === today) return null;
  return { today, daysBefore };
}

/**
 * Claims today's reminder for an appointment; false when it was already sent. Inserts
 * it as sent, or — when it was seeded as 'scheduled' — flips that row to sent. The
 * UPDATE's status filter makes concurrent runs race safely: only one matches the row.
 */
async function claimReminder(
  poolDb: Pool,
  kind: "doctor" | "lab",
  appointmentId: string,
  today: string,
  daysBefore: number,
): Promise<boolean> {
  const [inserted] = await poolDb.query(
    `INSERT IGNORE INTO appointment_reminders (id, appointment_kind, appointment_id, reminder_date, days_before, status)
     VALUES (?, ?, ?, ?, ?, 'sent')`,
    [newId(), kind, appointmentId, today, daysBefore],
  );
  if ((inserted as { affectedRows: number }).affectedRows > 0) return true;
  const [updated] = await poolDb.query(
    `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW(3), days_before = ?
      WHERE appointment_kind = ? AND appointment_id = ? AND reminder_date = ? AND status = 'scheduled'`,
    [daysBefore, kind, appointmentId, today],
  );
  return (updated as { affectedRows: number }).affectedRows > 0;
}

async function emailReminder(
  poolDb: Pool,
  accountUserId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
  rows: Array<{ label: string; value: string; sub?: string }>,
): Promise<void> {
  const userId = await patientRecipient(poolDb, accountUserId, type, payload);
  if (!userId) return;
  const [users] = await poolDb.query<Row[]>(`SELECT email FROM users WHERE id = ?`, [userId]);
  const email = users[0]?.email as string | undefined;
  if (!email) return;
  const { title, body } = pushContentFor(type, payload);
  await sendEmail(email, title, body, detailsEmailHtml({ heading: title, intro: body, rows, patientFacing: true }));
}

async function remindDoctorAppointments(poolDb: Pool): Promise<number> {
  const [candidates] = await poolDb.query<Row[]>(
    `SELECT a.id, a.patient_id, a.scheduled_date, a.scheduled_time, a.created_at,
            d.name AS doctor_name, b.name AS branch_name, b.address AS branch_address,
            b.timezone AS branch_timezone, c.name AS clinic_name, ap.name AS visitor_name
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN branches b ON b.id = a.branch_id
       JOIN clinics c ON c.id = a.clinic_id
       LEFT JOIN appointment_patients ap ON ap.appointment_id = a.id
      WHERE a.status IN ('confirmed', 'paid')
        AND a.scheduled_date BETWEEN UTC_DATE() AND DATE_ADD(UTC_DATE(), INTERVAL ${REMINDER_DAYS_BEFORE + 1} DAY)
      LIMIT ${BATCH_LIMIT}`,
  );

  let sent = 0;
  for (const appt of candidates) {
    const date = String(appt.scheduled_date).slice(0, 10);
    const due = reminderDaysBefore(appt, date);
    if (!due) continue;
    try {
      if (!(await claimReminder(poolDb, "doctor", appt.id, due.today, due.daysBefore))) continue;
      const payload = {
        appointment_id: appt.id,
        date,
        time: appt.scheduled_time,
        doctor_name: appt.doctor_name,
        branch_name: appt.branch_name,
        days_before: due.daysBefore,
      };
      await createPatientNotification(poolDb, appt.patient_id, "appointment_reminder", payload);
      await emailReminder(poolDb, appt.patient_id, "appointment_reminder", payload, [
        ...(appt.visitor_name ? [{ label: "Patient", value: String(appt.visitor_name) }] : []),
        { label: "Doctor", value: `Dr. ${appt.doctor_name}` },
        { label: "Clinic", value: String(appt.clinic_name), sub: [appt.branch_name, appt.branch_address].filter(Boolean).join(" · ") },
        { label: "Date & Time", value: `${date} at ${appt.scheduled_time}` },
      ]);
      sent += 1;
    } catch (err) {
      // One failing appointment must not block the rest of the sweep.
      console.error(`[reminders] doctor appointment ${appt.id} failed:`, err);
    }
  }
  return sent;
}

/** Clinic-added notes from confirmation (lab_test_appointments.precautions JSON). */
function clinicPrecautions(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
}

async function remindLabTestAppointments(poolDb: Pool): Promise<number> {
  const [candidates] = await poolDb.query<Row[]>(
    `SELECT a.id, a.patient_id, a.appointment_number, a.appointment_date, a.start_time, a.created_at,
            a.service_mode, a.home_address, a.precautions,
            lt.name AS test_name, b.name AS branch_name, b.address AS branch_address,
            b.timezone AS branch_timezone, c.name AS clinic_name, ltap.name AS visitor_name
       FROM lab_test_appointments a
       JOIN lab_tests lt ON lt.id = a.test_id
       JOIN branches b ON b.id = a.branch_id
       JOIN clinics c ON c.id = a.clinic_id
       LEFT JOIN lab_test_appointment_patients ltap ON ltap.appointment_id = a.id
      WHERE a.status = 'APPROVED'
        AND a.appointment_date BETWEEN UTC_DATE() AND DATE_ADD(UTC_DATE(), INTERVAL ${REMINDER_DAYS_BEFORE + 1} DAY)
      LIMIT ${BATCH_LIMIT}`,
  );

  const due = candidates.flatMap((appt) => {
    const date = String(appt.appointment_date).slice(0, 10);
    const when = reminderDaysBefore(appt, date);
    return when ? [{ appt, date, when }] : [];
  });
  const testPrecautions = await loadAppointmentPrecautions(poolDb, due.map((c) => String(c.appt.id)));

  let sent = 0;
  for (const { appt, date, when } of due) {
    try {
      if (!(await claimReminder(poolDb, "lab", appt.id, when.today, when.daysBefore))) continue;
      // The booking's copy of the test's precautions plus any the clinic added on confirm.
      const precautions = [
        ...precautionLines(testPrecautions.get(String(appt.id)) ?? []),
        ...clinicPrecautions(appt.precautions),
      ];
      const payload = {
        appointment_id: appt.id,
        appointment_number: appt.appointment_number,
        test_name: appt.test_name,
        date,
        time: appt.start_time,
        branch_name: appt.branch_name,
        clinic_name: appt.clinic_name,
        service_mode: appt.service_mode,
        days_before: when.daysBefore,
        precautions,
      };
      await createPatientNotification(poolDb, appt.patient_id, "lab_test_reminder", payload);
      const isHome = appt.service_mode === "HOME";
      await emailReminder(poolDb, appt.patient_id, "lab_test_reminder", payload, [
        { label: "Appointment Number", value: String(appt.appointment_number) },
        ...(appt.visitor_name ? [{ label: "Patient", value: String(appt.visitor_name) }] : []),
        { label: "Test", value: String(appt.test_name) },
        { label: "Clinic", value: String(appt.clinic_name), sub: [appt.branch_name, appt.branch_address].filter(Boolean).join(" · ") },
        {
          label: "Date & Time",
          value: appt.start_time ? `${date} at ${appt.start_time}` : date,
          sub: isHome ? `Home Collection${appt.home_address ? ` · ${appt.home_address}` : ""}` : "Clinic Visit",
        },
        ...(precautions.length > 0 ? [{ label: "Precautions", value: precautions.join("\n") }] : []),
      ]);
      sent += 1;
    } catch (err) {
      console.error(`[reminders] lab test appointment ${appt.id} failed:`, err);
    }
  }
  return sent;
}

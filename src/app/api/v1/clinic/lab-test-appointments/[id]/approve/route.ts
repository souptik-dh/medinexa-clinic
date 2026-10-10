import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool, withTransaction } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import {
  getLabTestAppointmentInScope,
  transitionLabAppointment,
  auditLabAction,
  serializeLabTestAppointment,
} from "@api/lib/lab-tests";
import { loadAppointmentPrecautions, precautionLines, withAppointmentPrecautions } from "@api/lib/lab-test-precautions";
import {
  createPatientNotification,
  branchContactEmails,
  sendEmail,
  detailsEmailHtml,
  patientEmailHtml,
  sendBookingConfirmationWhatsapp,
  personalizeForPatient,
} from "@api/lib/notifications";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { assertClinicOperational } from "@api/lib/subscriptions";
import { badRequest, conflict, isUniqueViolation } from "@api/lib/errors";
import { assertAssignableLabTime } from "@api/lib/lab-test-availability";
import { issueReceipt } from "@api/lib/receipts";
import { z } from "zod";

const approveSchema = z.object({
  // The test time the clinic assigns (patients book a date only). Required while the
  // booking has no time yet; an older booking that already has one may keep it.
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM (24h) format.").optional(),
  precautions: z.array(z.string().max(500)).optional(),
  clinic_notes: z.string().max(1000).optional(),
});

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const { id } = ctx.params;
  const body = parseBody(approveSchema, await ctx.request.json());

  const appointment = await getLabTestAppointmentInScope(pool, id, auth);

  if (auth.role !== "sys_admin") {
    await assertClinicOperational(pool, appointment.clinic_id);
  }

  if (auth.role === "branch_staff") {
    await assertBranchStaffPermission(pool, auth, appointment.branch_id, "lab_appointments:approve");
  }

  if (appointment.prescription_required && !appointment.prescription_id) {
    throw badRequest("PRESCRIPTION_REQUIRED", "Cannot approve — prescription is required but not uploaded.");
  }

  if (!body.start_time && !appointment.start_time) {
    throw badRequest("VALIDATION_ERROR", "Assign a test time before confirming the booking.", "start_time");
  }
  // Within the branch's lab hours for the booking date, not already over (branch tz),
  // and not overlapping another booking of this test that already has a time.
  const assigned = body.start_time
    ? await assertAssignableLabTime(pool, appointment as never, body.start_time, String(appointment.branch_timezone))
    : null;
  const startTime: string = assigned?.start ?? appointment.start_time;
  const endTime: string = assigned?.end ?? appointment.end_time;

  let finalPrecautions: string[] = [];
  if (appointment.precautions) {
    const existing = typeof appointment.precautions === "string"
      ? JSON.parse(appointment.precautions)
      : appointment.precautions;
    if (Array.isArray(existing)) {
      finalPrecautions = [...existing];
    }
  }
  if (body.precautions && body.precautions.length > 0) {
    finalPrecautions = [...finalPrecautions, ...body.precautions];
  }

  try {
    await withTransaction(async (conn) => {
      await transitionLabAppointment(conn, appointment, "APPROVED", auth.userId, `Confirmed by clinic for ${startTime}`);
      await conn.query(
        `UPDATE lab_test_appointments SET
          start_time = ?, end_time = ?,
          approved_by = ?, approved_at = NOW(3),
          clinic_notes = COALESCE(?, clinic_notes),
          precautions = ?
         WHERE id = ?`,
        [
          startTime,
          endTime,
          auth.userId,
          body.clinic_notes ?? null,
          finalPrecautions.length > 0 ? JSON.stringify(finalPrecautions) : null,
          id,
        ],
      );
      await auditLabAction(conn, auth.userId, "appointment_approved", id, {
        start_time: startTime,
        precautions: body.precautions,
        clinic_notes: body.clinic_notes,
      });
    });
  } catch (err) {
    // Two staff confirming different bookings into the same time at once — uniq_lab_slot.
    if (isUniqueViolation(err)) {
      throw conflict(
        "SLOT_NOT_AVAILABLE",
        "This time is already assigned to another confirmed booking for this test. Choose another time.",
      );
    }
    throw err;
  }

  // The test's precautions (the booking's copy) plus any the clinic added while confirming.
  const testPrecautions = precautionLines((await loadAppointmentPrecautions(pool, [id])).get(id) ?? []);
  const allPrecautions = [...testPrecautions, ...finalPrecautions];

  await createPatientNotification(pool, appointment.patient_id, "lab_test_approved", {
    appointment_id: id,
    appointment_number: appointment.appointment_number,
    test_name: appointment.test_name,
    date: appointment.appointment_date,
    time: startTime,
    branch_name: appointment.branch_name,
    clinic_name: appointment.clinic_name,
    precautions: allPrecautions,
  });

  const emailHtml = detailsEmailHtml({
    heading: "Lab Test Appointment Confirmed",
    intro: `The clinic has confirmed your lab test booking and assigned your test time.`,
    patientFacing: true,
    rows: [
      { label: "Appointment Number", value: appointment.appointment_number },
      { label: "Test", value: appointment.test_name },
      { label: "Branch", value: appointment.branch_name },
      { label: "Date & Time", value: `${appointment.appointment_date} at ${startTime}`, sub: appointment.service_mode === "HOME" ? "Home Collection" : "Clinic Visit" },
      { label: "Payment", value: appointment.payment_status === "PAID" ? "Paid" : "Pay at Clinic" },
      ...(allPrecautions.length > 0 ? [{ label: "Precautions", value: allPrecautions.join("\n") }] : []),
      ...(body.clinic_notes ? [{ label: "Clinic Notes", value: body.clinic_notes }] : []),
    ],
  });

  if (appointment.patient_email) {
    await sendEmail(appointment.patient_email, `Lab Test Confirmed — ${appointment.appointment_number}`, "", emailHtml);
  }
  // Lab booking confirmation is the only non-OTP lab message patients receive on WhatsApp.
  const patientPhone = appointment.visitor_phone || appointment.patient_phone;
  if (patientPhone) {
    const confirmText =
      personalizeForPatient(
        `Your lab test appointment ${appointment.appointment_number} (${appointment.test_name}) at ${appointment.branch_name} on ${appointment.appointment_date} at ${startTime} has been confirmed.`,
        appointment.visitor_name,
        appointment.visitor_relationship,
      ) +
      (allPrecautions.length > 0
        ? `\n\nPlease follow these precautions before your test:\n${allPrecautions.map((p) => `• ${p}`).join("\n")}`
        : "");
    await sendBookingConfirmationWhatsapp(patientPhone, confirmText);
  }

  const updated = await getLabTestAppointmentInScope(pool, id, auth);

  await issueReceipt(pool, {
    sourceType: "lab_test_appointment",
    sourceId: updated.id,
    eventType: "booking_confirmed",
    patientId: updated.patient_id,
    clinicId: updated.clinic_id,
    branchId: updated.branch_id,
    amount: Number(updated.price),
    currency: updated.currency,
    generatedBy: auth.userId,
    details: {
      patient_name: updated.patient_name ?? null,
      test_name: updated.test_name ?? null,
      clinic_name: updated.clinic_name ?? null,
      branch_name: updated.branch_name ?? null,
      branch_address: updated.branch_address ?? null,
      branch_phone: updated.branch_phone ?? null,
      appointment_number: updated.appointment_number,
      service_mode: updated.service_mode,
      scheduled_date: updated.appointment_date,
      scheduled_time: updated.start_time,
      price: Number(updated.price),
      currency: updated.currency,
      paid: updated.payment_status === "PAID",
    },
  });

  const [result] = await withAppointmentPrecautions(pool, [serializeLabTestAppointment(updated)]);
  return json(result);
});

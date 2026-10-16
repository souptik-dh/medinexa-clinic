import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool, withTransaction } from "@api/lib/db";
import {
  getLabTestAppointmentInScope,
  transitionLabAppointment,
  auditLabAction,
  serializeLabTestAppointment,
} from "@api/lib/lab-tests";
import { withAppointmentPrecautions } from "@api/lib/lab-test-precautions";
import { hasSlotPassedInTz } from "@api/lib/availability";
import { createPatientNotification, sendEmail, detailsEmailHtml } from "@api/lib/notifications";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { assertClinicOperational } from "@api/lib/subscriptions";
import { badRequest, conflict } from "@api/lib/errors";
import { issueReceipt } from "@api/lib/receipts";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const { id } = ctx.params;

  const appointment = await getLabTestAppointmentInScope(pool, id, auth);

  if (auth.role !== "sys_admin") {
    await assertClinicOperational(pool, appointment.clinic_id);
  }

  if (auth.role === "branch_staff") {
    await assertBranchStaffPermission(pool, auth, appointment.branch_id, "lab_appointments:complete");
  }

  // Only APPROVED bookings complete, and confirming always sets the time; the fallback is
  // just a guard for a row without one (completable once its day is over).
  if (!hasSlotPassedInTz(appointment.appointment_date, appointment.start_time ?? "23:59", appointment.branch_timezone)) {
    throw conflict(
      "APPOINTMENT_NOT_YET_DUE",
      "Cannot mark as completed before the scheduled date and time have passed.",
    );
  }

  await withTransaction(async (conn) => {
    await transitionLabAppointment(conn, appointment, "COMPLETED", auth.userId, "Test completed");
    await conn.query(
      `UPDATE lab_test_appointments SET completed_at = NOW(3) WHERE id = ?`,
      [id],
    );
    await auditLabAction(conn, auth.userId, "appointment_completed", id);
  });

  await createPatientNotification(pool, appointment.patient_id, "lab_test_completed", {
    appointment_id: id,
    appointment_number: appointment.appointment_number,
    test_name: appointment.test_name,
    date: appointment.appointment_date,
    time: appointment.start_time,
  });

  if (appointment.patient_email) {
    await sendEmail(
      appointment.patient_email,
      `Lab Test Completed — ${appointment.appointment_number}`,
      `Your lab test has been completed.`,
      detailsEmailHtml({
        heading: "Lab Test Completed",
        intro: "Your lab test has been completed successfully.",
        patientFacing: true,
        rows: [
          { label: "Appointment Number", value: appointment.appointment_number },
          { label: "Test", value: appointment.test_name },
          { label: "Branch", value: appointment.branch_name },
          { label: "Date & Time", value: `${appointment.appointment_date}${appointment.start_time ? ` at ${appointment.start_time}` : ""}` },
        ],
      }),
    );
  }

  const updated = await getLabTestAppointmentInScope(pool, id, auth);

  await issueReceipt(pool, {
    sourceType: "lab_test_appointment",
    sourceId: updated.id,
    eventType: "completed",
    patientId: updated.patient_id,
    clinicId: updated.clinic_id,
    branchId: updated.branch_id,
    amount: Number(updated.price),
    currency: updated.currency,
    paymentMethod: updated.payment_method ?? null,
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

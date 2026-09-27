import { z } from "zod";
import { api, json } from "@api/lib/http";
import { pool, withTransaction, type Row } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireRoles } from "@api/lib/auth";
import { badRequest, notFound } from "@api/lib/errors";
import { getAppointmentInScope, getAppointmentNames, transition, serializeAppointment } from "@api/lib/appointments";
import {
  createPatientNotification,
  notifyClinicSide,
  sendEmail,
  detailsEmailHtml,
  emailPatient,
  branchContactEmails,
} from "@api/lib/notifications";
import { newId } from "@api/lib/ids";
import { runIdempotent } from "@api/lib/idempotency";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { assertClinicOperational } from "@api/lib/subscriptions";
import { issueReceipt } from "@api/lib/receipts";

const schema = z.object({
  fee_amount: z.coerce.number().positive().max(1_000_000),
  method: z.enum(["cash", "upi"]),
  reference_no: z.string().trim().max(255).optional().nullable(),
});

export const PATCH = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["branch_staff", "clinic_owner"]);
  const idemKey = ctx.request.headers.get("idempotency-key");
  if (!idemKey) {
    throw badRequest(
      "IDEMPOTENCY_KEY_REQUIRED",
      "An Idempotency-Key header is required for this endpoint.",
    );
  }

  const rawBody = await ctx.request.text();
  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    throw badRequest("INVALID_JSON", "Request body must be a valid JSON object.");
  }
  const body = parseBody(schema, parsedJson);

  const result = await runIdempotent(`appointments:${ctx.params.id}:payment`, idemKey, rawBody, async () => {
    const paymentId = newId();
    const pendingEmails: Array<() => Promise<void>> = [];
    await withTransaction(async (conn) => {
      const appt = await getAppointmentInScope(conn, ctx.params.id, auth);
      await assertClinicOperational(conn, appt.clinic_id);
      await assertBranchStaffPermission(conn, auth, appt.branch_id, "appointments:payment");
      await transition(conn, appt, "paid", auth.userId, ["confirmed"]);
      await conn.query(
        `INSERT INTO payments (id, appointment_id, amount, currency, method, collected_by, reference_no)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          appt.id,
          body.fee_amount,
          appt.currency,
          body.method,
          auth.userId,
          body.reference_no ?? null,
        ],
      );
      await conn.query(
        `UPDATE appointments SET payment_method = ? WHERE id = ?`,
        [body.method, appt.id],
      );
      await conn.query(
        `INSERT INTO clinic_payment_ledger (id, clinic_id, branch_id, period_month, currency, total_amount, payment_count)
         VALUES (?, ?, ?, DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m'), ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           total_amount = total_amount + VALUES(total_amount),
           payment_count = payment_count + 1`,
        [newId(), appt.clinic_id, appt.branch_id, appt.currency, body.fee_amount],
      );
      const names = await getAppointmentNames(conn, appt.id);
      const patientPayload = {
        appointment_id: appt.id,
        amount: body.fee_amount,
        method: body.method,
        currency: appt.currency,
        date: appt.scheduled_date,
        time: appt.scheduled_time,
        doctor_name: names.doctor_name,
        branch_name: names.branch_name,
      };
      await createPatientNotification(conn, appt.patient_id, "payment_received", patientPayload);
      pendingEmails.push(() => emailPatient(pool, appt.patient_id, "payment_received", patientPayload));
      await notifyClinicSide(conn, appt.branch_id, appt.clinic_id, "payment_received", {
        appointment_id: appt.id,
        patient_id: appt.patient_id,
        amount: body.fee_amount,
        method: body.method,
        currency: appt.currency,
        branch_name: names.branch_name,
        visitor_name: names.visitor_name ?? names.patient_name,
      });
    });

    await Promise.all(pendingEmails.map((send) => send()));

    const [rows] = await pool.query<Row[]>(`SELECT * FROM appointments WHERE id = ?`, [ctx.params.id]);
    const appointment = rows[0];
    if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "Appointment not found.");

const [details] = await pool.query<Row[]>(
    `SELECT u.name AS patient_name,
                        b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone, c.name AS clinic_name, d.name AS doctor_name
       FROM appointments a
       JOIN users u ON u.id = a.patient_id
       JOIN clinics c ON c.id = a.clinic_id
       JOIN branches b ON b.id = a.branch_id
       JOIN doctors d ON d.id = a.doctor_id
      WHERE a.id = ?`,
    [ctx.params.id],
  );
  const info = details[0];

    await issueReceipt(pool, {
      sourceType: "appointment",
      sourceId: appointment.id,
      eventType: "payment_received",
      patientId: appointment.patient_id,
      clinicId: appointment.clinic_id,
      branchId: appointment.branch_id,
      amount: body.fee_amount,
      currency: appointment.currency,
      paymentMethod: body.method,
      referenceNo: body.reference_no ?? null,
      generatedBy: auth.userId,
      details: {
        patient_name: info?.patient_name ?? null,
        doctor_name: info?.doctor_name ?? null,
        clinic_name: info?.clinic_name ?? null,
        branch_name: info?.branch_name ?? null,
        branch_address: info?.branch_address ?? null,
        branch_phone: info?.branch_phone ?? null,
        scheduled_date: appointment.scheduled_date,
        scheduled_time: appointment.scheduled_time,
        amount: body.fee_amount,
        currency: appointment.currency,
        payment_method: body.method,
        reference_no: body.reference_no ?? null,
        paid: true,
      },
    });
    // Staff and the clinic owner alike get the payment email.
    const clinicEmails = await branchContactEmails(pool, appointment.branch_id);
    if (clinicEmails.length > 0) {
      const paymentBody = `A payment of ${body.fee_amount} ${appointment.currency} was collected via ${body.method} from ${info.patient_name ?? "a patient"} at ${info.branch_name}.${body.reference_no ? `\nReference: ${body.reference_no}` : ""}`;
      const paymentHtml = detailsEmailHtml({
        heading: "Payment Received",
        intro: `A payment was collected at ${info.branch_name}.`,
        rows: [
          { label: "Amount", value: `${body.fee_amount} ${appointment.currency}` },
          { label: "Method", value: body.method },
          { label: "Patient", value: info.patient_name ?? "a patient" },
          { label: "Branch", value: info.branch_name },
          ...(body.reference_no ? [{ label: "Reference", value: body.reference_no }] : []),
        ],
      });
      await Promise.all(
        clinicEmails.map((email) =>
          sendEmail(email, `Payment received — ${info.patient_name ?? "Patient"}`, paymentBody, paymentHtml),
        ),
      );
    }

    return { status: 200, body: serializeAppointment(appointment) };
  });

  return json(result.body, result.status);
});

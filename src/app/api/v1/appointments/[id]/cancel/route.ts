import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { pool, withTransaction, type Row } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireRoles } from "@api/lib/auth";
import { notFound } from "@api/lib/errors";

import { getAppointmentInScope, getAppointmentNames, transition, serializeAppointment } from "@api/lib/appointments";
import { createPatientNotification, notifyClinicSide, emailPatient, emailBranchContacts } from "@api/lib/notifications";
import { assertBranchStaffPermission } from "@api/lib/permissions";

const schema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

export const PATCH = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "branch_staff", "clinic_owner"]);
  const body = parseBody(schema, await readJson(ctx.request));

  const pendingEmails: Array<() => Promise<void>> = [];
  await withTransaction(async (conn) => {
    const appt = await getAppointmentInScope(conn, ctx.params.id, auth);

    if (auth.role === "branch_staff") {
      await assertBranchStaffPermission(conn, auth, appt.branch_id, "appointments:cancel");
    }

    const allowedFrom =
      auth.role === "patient"
        ? ["pending", "confirmed"]
        : ["pending", "confirmed", "paid"];

    await transition(conn, appt, "cancelled", auth.userId, allowedFrom, body.reason ?? null);
    const names = await getAppointmentNames(conn, appt.id);

    if (auth.role === "patient") {
      const clinicPayload = {
        appointment_id: appt.id,
        patient_id: appt.patient_id,
        reason: body.reason ?? null,
        date: appt.scheduled_date,
        time: appt.scheduled_time,
        doctor_name: names.doctor_name,
        branch_name: names.branch_name,
        visitor_name: names.visitor_name ?? names.patient_name,
      };
      await notifyClinicSide(conn, appt.branch_id, appt.clinic_id, "appointment_cancelled", clinicPayload);
      pendingEmails.push(() => emailBranchContacts(pool, appt.branch_id, "appointment_cancelled", clinicPayload));
    } else {
      const patientPayload = {
        appointment_id: appt.id,
        date: appt.scheduled_date,
        time: appt.scheduled_time,
        reason: body.reason ?? null,
        doctor_name: names.doctor_name,
        branch_name: names.branch_name,
      };
      await createPatientNotification(conn, appt.patient_id, "appointment_cancelled", patientPayload);
      pendingEmails.push(() => emailPatient(pool, appt.patient_id, "appointment_cancelled", patientPayload));
    }
    return appt;
  });

  await Promise.all(pendingEmails.map((send) => send()));

  const [rows] = await pool.query<Row[]>(`SELECT * FROM appointments WHERE id = ?`, [ctx.params.id]);
  const appointment = rows[0];
  if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "Appointment not found.");

  return json(serializeAppointment(appointment));
});

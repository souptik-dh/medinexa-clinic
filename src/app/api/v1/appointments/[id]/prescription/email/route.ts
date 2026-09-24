import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { requireAssignedDoctor } from "@api/lib/prescriptions";
import { getAppointmentInScope } from "@api/lib/appointments";
import { sendEmail, sendWhatsapp, patientEmailHtml } from "@api/lib/notifications";
import { notFound } from "@api/lib/errors";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["doctor", "patient"]);

  let appointment: Row;
  if (auth.role === "doctor") {
    appointment = await requireAssignedDoctor(pool, ctx.params.id, auth);
  } else {
    appointment = await getAppointmentInScope(pool, ctx.params.id, auth);
  }

  const [rows] = await pool.query<Row[]>(
    `SELECT u.email, u.phone, u.name FROM users u WHERE u.id = ?`,
    [appointment.patient_id],
  );
  const patient = rows[0];
  if (!patient) {
    throw notFound("PATIENT_NOT_FOUND", "Patient account not found.");
  }

  const rxBody = `Your prescription for appointment ${appointment.id} is ready. Download it from the app.`;
  if (patient.phone) {
    await sendWhatsapp(
      patient.phone,
      `Jido Healthcare: Your prescription for appointment ${appointment.id} is ready. Download it from the app.`,
    );
  }
  if (patient.email) {
    await sendEmail(
      patient.email,
      "Your prescription",
      rxBody,
      patientEmailHtml(rxBody),
    );
  }

  return json({ queued: true }, 202);
});

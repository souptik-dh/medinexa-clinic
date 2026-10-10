import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool, withTransaction } from "@api/lib/db";
import { newId } from "@api/lib/ids";
import { parseBody, phoneSchema } from "@api/lib/validators";
import {
  generateAppointmentNumber,
  serializeLabTestAppointment,
  auditLabAction,
} from "@api/lib/lab-tests";
import { assertLabDateBookable } from "@api/lib/lab-test-availability";
import { precautionLines, snapshotAppointmentPrecautions, withAppointmentPrecautions } from "@api/lib/lab-test-precautions";
import {
  notifyBranchStaff,
  createClinicUserNotification,
  branchContactEmails,
  sendEmail,
  detailsEmailHtml,
  emailPatient,
} from "@api/lib/notifications";
import { runIdempotent } from "@api/lib/idempotency";
import { assertClinicOperational } from "@api/lib/subscriptions";
import { badRequest, conflict, notFound, unprocessable } from "@api/lib/errors";
import { todayInTz } from "@api/lib/availability";
import { resolveServicePatient, type ResolvedServicePatient } from "@api/lib/patient-identity";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";

const patientDetailsSchema = z.object({
  // Reception only: select an existing patient found via GET /api/v1/patients/lookup
  // instead of registering a new one. Ignored for the "patient" role — a patient
  // account can never point a booking at an arbitrary patient_id it doesn't control.
  patient_id: z.string().uuid().optional(),
  // Reception only: the Patient App account (profile) the booking belongs to — picked
  // via /patients/lookup — or, for a new walk-in, the profile's name. The entered
  // phone is the profile's. Profile and patient are stored apart (patient-identity.ts).
  profile_user_id: z.string().uuid().optional(),
  profile_name: z.string().trim().max(255).optional().nullable(),
  relationship: z.enum(["self", "spouse", "child", "parent", "sibling", "friend", "other"]).default("self"),
  name: z.string().trim().min(1).max(255),
  // Normalized to +91XXXXXXXXXX so downstream SMS/WhatsApp dispatch (which needs the
  // country code for both the SMS gateway and WhatsApp's chatId) doesn't reject a
  // plain 10-digit number typed by staff at booking time.
  // Optional when a known person is picked (patient_id / profile_user_id) or for an app
  // user's family member (defaults to the account's phone); required for a new walk-in.
  phone: phoneSchema.optional().nullable(),
  age: z.number().int().min(0).max(150),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
});

const createSchema = z.object({
  branch_id: z.string().uuid(),
  branch_lab_test_id: z.string().uuid(),
  service_mode: z.enum(["CLINIC", "HOME"]),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // No longer chosen by the booker — the clinic assigns the time when it confirms.
  // Still accepted (and ignored) so older app versions keep working.
  start_time: z.string().optional(),
  prescription_id: z.string().uuid().optional(),
  referring_doctor_name: z.string().trim().min(1).max(255).optional(),
  patient_notes: z.string().max(1000).optional(),
  payment_method: z.enum(["PAY_AT_CLINIC", "ONLINE"]).default("PAY_AT_CLINIC"),
  home_address: z.string().max(1000).optional(),
  home_lat: z.number().optional(),
  home_lng: z.number().optional(),
  home_contact_phone: z.string().max(32).optional(),
  home_notes: z.string().max(500).optional(),
  // Always required — name, phone, age, and gender of the patient the test is for.
  patient_details: patientDetailsSchema,
});

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "branch_staff", "clinic_owner"]);
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
  const body = parseBody(createSchema, parsedJson);

  const result = await runIdempotent("lab-test-appointments:create", idemKey, rawBody, async () => {
    const [branchRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.*, c.owner_user_id FROM branches b JOIN clinics c ON c.id = b.clinic_id
       WHERE b.id = ? AND b.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [body.branch_id],
    );
    if (branchRows.length === 0) {
      throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
    }
    const branch = branchRows[0];

    // Clinic staff / owner may book on behalf of a walk-in patient, but only at a
    // branch they are scoped to. The patient themselves can book at any branch.
    if (auth.role === "clinic_owner" && branch.owner_user_id !== auth.userId) {
      throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
    }
    if (auth.role === "branch_staff" && auth.branchId !== body.branch_id) {
      throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
    }
    // New bookings are rejected while the clinic's subscription is inactive.
    await assertClinicOperational(pool, branch.clinic_id);

    const [bltRows] = await pool.query<RowDataPacket[]>(
      `SELECT blt.*, lt.name AS test_name, lt.status AS test_status
         FROM branch_lab_tests blt JOIN lab_tests lt ON lt.id = blt.test_id
       WHERE blt.id = ? AND blt.branch_id = ? AND blt.status = 'active' AND lt.status = 'active'`,
      [body.branch_lab_test_id, body.branch_id],
    );
    if (bltRows.length === 0) {
      throw notFound("BRANCH_TEST_NOT_FOUND", "Lab test not found or inactive at this branch.");
    }
    const blt = bltRows[0];

    if (body.service_mode === "HOME" && !blt.home_collection_available) {
      throw badRequest("SERVICE_MODE_NOT_SUPPORTED", "Home collection is not available for this test.");
    }
    if (body.service_mode === "CLINIC" && !blt.clinic_available) {
      throw badRequest("SERVICE_MODE_NOT_SUPPORTED", "Clinic visit is not available for this test.");
    }

    // A patient attaches their uploaded prescription here. Reception has the paper
    // prescription in hand and attaches it right after booking (POST /patient-documents/upload
    // with lab_test_appointment_id) — the booking can't be confirmed until it is.
    if (blt.prescription_required && !body.prescription_id && auth.role === "patient") {
      throw badRequest("PRESCRIPTION_REQUIRED", "Prescription is required for this test.");
    }

    if (body.service_mode === "HOME") {
      if (!body.home_address) {
        throw badRequest("VALIDATION_ERROR", "Home address is required for home collection.");
      }
    }

    // "Today" is the branch's date, not the server's UTC date.
    const tz = String(branch.timezone);
    if (body.appointment_date < todayInTz(tz)) {
      throw unprocessable("DATE_IN_PAST", "Cannot book for a past date.", "appointment_date");
    }

    // The date must still be bookable: lab hours that day, today's hours not over,
    // and at least one time the clinic can still assign.
    await assertLabDateBookable(
      pool,
      body.branch_id,
      body.branch_lab_test_id,
      body.appointment_date,
      Number(blt.duration_minutes),
      tz,
    );

    let patientDetails = body.patient_details;
    if (auth.role !== "patient" && !patientDetails.patient_id && !patientDetails.profile_user_id && !patientDetails.phone) {
      throw badRequest("VALIDATION_ERROR", "phone is required for a new patient.", "phone");
    }
    let resolved: ResolvedServicePatient | null = null;

    const appointmentId = newId();
    const appointmentNumber = generateAppointmentNumber();
    const durationMinutes = Number(blt.duration_minutes);

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO lab_test_appointments (
          id, appointment_number, patient_id, clinic_id, branch_id, branch_lab_test_id, test_id,
          service_mode, appointment_date, start_time, end_time, duration_minutes,
          price, currency, payment_method, payment_status,
          prescription_required, prescription_id, referring_doctor_name,
          patient_notes, home_address, home_lat, home_lng, home_contact_phone, home_notes,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          appointmentId,
          appointmentNumber,
          auth.userId,
          branch.clinic_id,
          body.branch_id,
          body.branch_lab_test_id,
          blt.test_id,
          body.service_mode,
          body.appointment_date,
          null, // start_time — assigned by the clinic on confirm
          null, // end_time
          durationMinutes,
          blt.price,
          blt.currency,
          body.payment_method,
          body.payment_method === "ONLINE" ? "PENDING" : "UNPAID",
          blt.prescription_required ? 1 : 0,
          body.prescription_id ?? null,
          body.referring_doctor_name ?? null,
          body.patient_notes ?? null,
          body.home_address ?? null,
          body.home_lat ?? null,
          body.home_lng ?? null,
          body.home_contact_phone ?? null,
          body.home_notes ?? null,
        ],
      );

      const servicePatient = await resolveServicePatient(conn, auth, patientDetails);
      resolved = servicePatient;

      // One active booking per patient, test and date (the time is assigned later, so
      // the date is the unit). Throwing here rolls the insert back.
      if (servicePatient.patientId) {
        const [dupes] = await conn.query<RowDataPacket[]>(
          `SELECT a.id FROM lab_test_appointments a
             JOIN lab_test_appointment_patients p ON p.appointment_id = a.id
            WHERE p.patient_id = ? AND a.branch_lab_test_id = ? AND a.appointment_date = ?
              AND a.id <> ? AND a.status NOT IN ('CANCELLED', 'REJECTED')
            LIMIT 1`,
          [servicePatient.patientId, body.branch_lab_test_id, body.appointment_date, appointmentId],
        );
        if (dupes.length > 0) {
          throw conflict("DUPLICATE_BOOKING", "This patient already has a booking for this test on the selected date.");
        }
      }
      await conn.query(
        `INSERT INTO lab_test_appointment_patients
           (id, appointment_id, patient_id, booking_source, booked_by, profile_user_id, profile_name,
            relationship, name, phone, age, gender)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          appointmentId,
          servicePatient.patientId,
          servicePatient.bookingSource,
          servicePatient.bookedBy,
          servicePatient.profileUserId,
          servicePatient.profileName,
          servicePatient.relationship,
          servicePatient.name,
          servicePatient.phone,
          patientDetails.age ?? null,
          patientDetails.gender ?? null,
        ],
      );

      // The test's precautions as they are now — later edits to the test don't change this booking.
      await snapshotAppointmentPrecautions(conn, appointmentId, blt.test_id);

      if (body.prescription_id) {
        await conn.query(
          `INSERT INTO lab_test_prescriptions (id, patient_id, appointment_id, file_name, file_url, mime_type, file_size, uploaded_at)
           SELECT id, ?, ?, file_name, file_url, mime_type, size_bytes, uploaded_at
           FROM medical_documents WHERE id = ? AND patient_id = ?`,
          [servicePatient.patientId ?? auth.userId, appointmentId, body.prescription_id, auth.userId],
        );
      }

      await conn.query(
        `INSERT INTO lab_test_payments (id, appointment_id, patient_id, amount, currency, payment_method, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId(), appointmentId, auth.userId, blt.price, blt.currency, body.payment_method, body.payment_method === "ONLINE" ? "PENDING" : "UNPAID"],
      );

      const notifyPayload = {
        appointment_id: appointmentId,
        appointment_number: appointmentNumber,
        test_name: blt.test_name,
        date: body.appointment_date,
        branch_name: branch.name,
        visitor_name: servicePatient.name,
        visitor_relationship: servicePatient.relationship,
      };
      await notifyBranchStaff(conn, body.branch_id, "lab_test_booked", notifyPayload);
      await createClinicUserNotification(conn, branch.owner_user_id, "lab_test_booked", notifyPayload, body.branch_id);

      await auditLabAction(conn, auth.userId, "appointment_created", appointmentId, {
        branch_id: body.branch_id,
        branch_lab_test_id: body.branch_lab_test_id,
        appointment_date: body.appointment_date,
        service_mode: body.service_mode,
      });
    });

    const [saved] = await pool.query<RowDataPacket[]>(
      `SELECT a.*, lt.name AS test_name, lt.code AS test_code, lt.category AS test_category,
              b.name AS branch_name, c.name AS clinic_name,
              u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone, u.photo_url AS patient_photo_url,
              b.photo_url AS branch_photo_url,
              (SELECT vu.photo_url FROM users vu WHERE vu.id = ltap.patient_id) AS visitor_photo_url,
              ltap.relationship AS visitor_relationship, ltap.name AS visitor_name,
              ltap.phone AS visitor_phone, ltap.age AS visitor_age, ltap.gender AS visitor_gender,
              ltap.patient_id AS visitor_patient_id, ltap.booking_source AS visitor_booking_source,
              ltap.booked_by AS visitor_booked_by, ltap.profile_user_id AS visitor_profile_user_id, ltap.profile_name AS visitor_profile_name
         FROM lab_test_appointments a
         JOIN lab_tests lt ON lt.id = a.test_id
         JOIN branches b ON b.id = a.branch_id
         JOIN clinics c ON c.id = a.clinic_id
         JOIN users u ON u.id = a.patient_id
         LEFT JOIN lab_test_appointment_patients ltap ON ltap.appointment_id = a.id
       WHERE a.id = ?`,
      [appointmentId],
    );

    const appointment = saved[0];
    // Assigned inside the insert transaction's callback, which TS can't follow.
    const done = resolved as ResolvedServicePatient | null;
    if (done) {
      patientDetails = { ...patientDetails, name: done.name, phone: done.phone, relationship: done.relationship };
    }
    const isForSelf = patientDetails.relationship === "self";

    const staffEmails = await branchContactEmails(pool, body.branch_id);
    // The booking's own copy of the test's precautions, sent with the booking notifications.
    const [created] = await withAppointmentPrecautions(pool, [serializeLabTestAppointment(appointment)]);
    const precautions = precautionLines(created.test_precautions);

    const emailSubject = `New Lab Test Booking — ${appointmentNumber}`;
    const emailBody = detailsEmailHtml({
      heading: "New Lab Test Booking",
      intro: `A patient has submitted a lab test booking for your review.`,
      rows: [
        { label: "Appointment Number", value: appointmentNumber },
        {
          label: "Visiting Patient",
          value: patientDetails.name,
          sub: isForSelf ? (appointment.patient_email ?? "") : `${patientDetails.relationship} of ${appointment.patient_name ?? "the account holder"}`,
        },
        ...(isForSelf
          ? []
          : [{ label: "Booked By", value: appointment.patient_name ?? "-", sub: `${appointment.patient_email ?? "-"} · Phone: ${appointment.patient_phone ?? "-"}` }]),
        { label: "Test", value: blt.test_name },
        { label: "Branch", value: branch.name },
        { label: "Booking Date", value: body.appointment_date, sub: body.service_mode === "HOME" ? "Home Collection" : "Clinic Visit" },
        { label: "Payment", value: body.payment_method === "ONLINE" ? "Online (Pending)" : "Pay at Clinic" },
        ...(precautions.length > 0 ? [{ label: "Test Precautions", value: precautions.join("\n") }] : []),
      ],
      note: "Please review the prescription (if uploaded), then confirm the booking and assign the test time — or reject it.",
    });

    for (const email of staffEmails) {
      await sendEmail(email, emailSubject, "", emailBody);
    }
    await emailPatient(pool, appointment.patient_id, "lab_test_booked", {
      appointment_number: appointmentNumber,
      test_name: blt.test_name,
      branch_name: branch.name,
      date: body.appointment_date,
      precautions,
    });

    return { status: 201, body: created };
  });

  return json(result.body, result.status);
});

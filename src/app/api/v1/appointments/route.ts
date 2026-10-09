import { z } from "zod";
import { api, json, decodeCursor } from "@api/lib/http";
import { pool, withTransaction, type Row } from "@api/lib/db";
import { parseBody, idSchema, timeSchema, parsePagination, phoneSchema } from "@api/lib/validators";
import { requireRoles } from "@api/lib/auth";
import { badRequest, conflict, notFound, unprocessable, isUniqueViolation } from "@api/lib/errors";
import { newId } from "@api/lib/ids";
import { runIdempotent } from "@api/lib/idempotency";
import { scopeWhere, serializeAppointment, APPT_STATUSES } from "@api/lib/appointments";
import { resolveServicePatient, type ResolvedServicePatient, type PatientDetailsInput } from "@api/lib/patient-identity";
import { notifyBranchStaff, patientRecipient, createClinicUserNotification, branchContactEmails, sendEmail, detailsEmailHtml, patientEmailHtml } from "@api/lib/notifications";
import {
  todayInTz,
  weekdayInTz,
  hasSlotEndedInTz,
  BOOKING_TIME_ENDED_MESSAGE,
  findNextSequentialSlot,
  getBranchSchedule,
  isWeekdayOpen,
  findCoveringLeave,
  scheduleFinalEndTime,
  isPastBookingCutoff,
  buildSlotCapacityMap,
} from "@api/lib/availability";
import { fetchPage } from "@api/lib/pagination";
import { assertClinicOperational } from "@api/lib/subscriptions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "branch_staff", "doctor", "clinic_owner"]);
  const sp = ctx.request.nextUrl.searchParams;
  const { limit, cursor } = parsePagination(sp);

  const whereParts: string[] = [];
  const params: unknown[] = [];
  const scope = scopeWhere(auth);
  whereParts.push(scope.where);
  params.push(...scope.params);

  const clinicId = sp.get("clinic_id");
  if (clinicId) {
    whereParts.push("a.clinic_id = ?");
    params.push(clinicId);
  }
  const doctorId = sp.get("doctor_id");
  if (doctorId) {
    if (!idSchema.safeParse(doctorId).success) {
      throw badRequest("VALIDATION_ERROR", "Invalid doctor_id filter.");
    }
    whereParts.push("a.doctor_id = ?");
    params.push(doctorId);
  }
  const branchId = sp.get("branch_id");
  if (branchId) {
    if (!idSchema.safeParse(branchId).success) {
      throw badRequest("VALIDATION_ERROR", "Invalid branch_id filter.");
    }
    whereParts.push("a.branch_id = ?");
    params.push(branchId);
  }
  const status = sp.get("status");
  if (status) {
    if (!(APPT_STATUSES as readonly string[]).includes(status)) {
      throw badRequest("VALIDATION_ERROR", "Invalid appointment status filter.");
    }
    whereParts.push("a.status = ?");
    params.push(status);
  }
  const dateFrom = sp.get("date_from");
  if (dateFrom) {
    if (!DATE_RE.test(dateFrom)) throw badRequest("VALIDATION_ERROR", "date_from must be YYYY-MM-DD.");
    whereParts.push("a.scheduled_date >= ?");
    params.push(dateFrom);
  }
  const dateTo = sp.get("date_to");
  if (dateTo) {
    if (!DATE_RE.test(dateTo)) throw badRequest("VALIDATION_ERROR", "date_to must be YYYY-MM-DD.");
    whereParts.push("a.scheduled_date <= ?");
    params.push(dateTo);
  }

  // Filters live inside the derived table (rather than as fetchPage's `where`) so the
  // outer query only ever sees one set of `created_at`/`id` columns — appointment_patients
  // has its own `id`/`created_at`, which would otherwise make the cursor clause ambiguous.
  const { rows, nextCursor } = await fetchPage({
    db: pool,
    select: "SELECT *",
    from: `FROM (
        SELECT a.*,
               (SELECT d.name FROM doctors d WHERE d.id = a.doctor_id) AS doctor_name,
               (SELECT d.photo_url FROM doctors d WHERE d.id = a.doctor_id) AS doctor_photo_url,
               (SELECT b.name FROM branches b WHERE b.id = a.branch_id) AS branch_name,
               (SELECT b.photo_url FROM branches b WHERE b.id = a.branch_id) AS branch_photo_url,
               (SELECT b.phone FROM branches b WHERE b.id = a.branch_id) AS branch_phone,
               (SELECT pu.photo_url FROM users pu WHERE pu.id = a.patient_id) AS patient_photo_url,
               ap.relationship AS visitor_relationship, ap.name AS visitor_name,
               ap.phone AS visitor_phone, ap.age AS visitor_age, ap.gender AS visitor_gender,
               ap.patient_id AS visitor_patient_id, ap.booking_source AS visitor_booking_source,
               ap.booked_by AS visitor_booked_by, ap.profile_user_id AS visitor_profile_user_id, ap.profile_name AS visitor_profile_name,
               (SELECT vu.photo_url FROM users vu WHERE vu.id = ap.patient_id) AS visitor_photo_url
          FROM appointments a
          LEFT JOIN appointment_patients ap ON ap.appointment_id = a.id
         WHERE ${whereParts.join(" AND ")}
      ) t`,
    params,
    cursor: decodeCursor(cursor),
    limit,
  });

  return json({
    items: rows.map(serializeAppointment),
    next_cursor: nextCursor,
  });
});

const patientDetailsSchema = z.object({
  // Reception only: select an existing patient found via GET /api/v1/patients/lookup
  // instead of registering a new one. Ignored for the "patient" role — a patient
  // account can never point a booking at an arbitrary patient_id it doesn't control.
  patient_id: idSchema.optional(),
  // Reception only: the Patient App account (profile) the booking belongs to — picked
  // via /patients/lookup — or, for a new walk-in, the profile's name. The entered
  // phone is the profile's. Profile and patient are stored apart (patient-identity.ts).
  profile_user_id: idSchema.optional(),
  profile_name: z.string().trim().max(255).optional().nullable(),
  relationship: z.enum(["self", "spouse", "child", "parent", "sibling", "friend", "other"]).default("self"),
  name: z.string().trim().min(1).max(255),
  // Required (not just normalized) so a staff/owner walk-in booking can never omit the
  // patient's number — omitting it used to make the confirmation SMS/WhatsApp silently
  // fall back to the booking account's own phone (the staff member's, for a walk-in),
  // instead of never reaching the actual patient. Normalized to +91XXXXXXXXXX so
  // downstream SMS/WhatsApp dispatch (which needs the country code for both the SMS
  // gateway and WhatsApp's chatId) doesn't reject a plain 10-digit number typed by staff.
  // Optional when a known person is picked (patient_id / profile_user_id) or for an app
  // user's family member (defaults to the account's phone); required for a new walk-in.
  phone: phoneSchema.optional().nullable(),
  age: z.number().int().min(0).max(150).optional().nullable(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
});

const schema = z.object({
  doctor_id: idSchema,
  branch_id: idSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: timeSchema.optional(),
  // Omit entirely to book for the account holder — defaults to their own name/phone below.
  patient_details: patientDetailsSchema.optional(),
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
  const body = parseBody(schema, parsedJson);

  const result = await runIdempotent("appointments:create", idemKey, rawBody, async () => {
    const [branches] = await pool.query<Row[]>(
      `SELECT b.id, b.name, b.timezone, b.clinic_id, c.owner_user_id
         FROM branches b
         JOIN clinics c ON c.id = b.clinic_id
        WHERE b.id = ? AND b.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [body.branch_id],
    );
    const branch = branches[0];
    if (!branch) throw notFound("BRANCH_NOT_FOUND", "Branch not found.");

    // Clinic staff / owner may book on behalf of a walk-in patient, but only at a
    // branch they are scoped to. The patient themselves can book at any branch.
    if (auth.role === "clinic_owner" && branch.owner_user_id !== auth.userId) {
      throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
    }
    if (auth.role === "branch_staff" && auth.branchId !== body.branch_id) {
      throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
    }
    if (auth.role !== "patient" && !body.patient_details) {
      throw badRequest(
        "VALIDATION_ERROR",
        "patient_details is required when booking an appointment on behalf of a patient.",
      );
    }
    const pd = body.patient_details;
    if (auth.role !== "patient" && pd && !pd.patient_id && !pd.profile_user_id && !pd.phone) {
      throw badRequest("VALIDATION_ERROR", "phone is required for a new patient.", "phone");
    }

    // New bookings are rejected while the clinic's subscription is inactive.
    await assertClinicOperational(pool, branch.clinic_id);

    const tz = branch.timezone as string;
    const today = todayInTz(tz);
    if (body.date < today) {
      throw unprocessable("DATE_IN_PAST", "The appointment date is in the past.");
    }
    const branchWeekday = weekdayInTz(body.date, tz);

    // None of these reads depends on another's result (all key off doctor_id/branch_id/
    // date, known already), so they run as one round trip instead of four sequential
    // ones. Their errors are still evaluated and thrown below in the same priority
    // order the original sequential checks used.
    const [branchSchedule, [leaveRows], [templates], [assignments], selfRows] = await Promise.all([
      getBranchSchedule(pool, body.branch_id, { from: body.date, to: body.date }),
      pool.query<Row[]>(
        `SELECT dse.id FROM doctor_slot_exceptions dse
           JOIN doctor_branch_assignments dba ON dba.id = dse.doctor_branch_assignment_id
          WHERE dba.doctor_id = ? AND dba.branch_id = ? AND dba.is_active = 1
            AND dse.status = 'active' AND dse.excluded_date <= ? AND COALESCE(dse.end_date, dse.excluded_date) >= ?
          LIMIT 1`,
        [body.doctor_id, body.branch_id, body.date, body.date],
      ),
      pool.query<Row[]>(
        `SELECT dst.start_time, dst.end_time, dst.slot_duration_minutes, dst.max_patients, dba.slot_type
           FROM doctor_slot_templates dst
           JOIN doctor_branch_assignments dba ON dba.id = dst.doctor_branch_assignment_id
          WHERE dba.doctor_id = ? AND dba.branch_id = ? AND dba.is_active = 1 AND dst.is_active = 1
            AND dst.weekday = ? AND dst.start_date <= ? AND (dst.end_date IS NULL OR dst.end_date >= ?)`,
        [body.doctor_id, body.branch_id, branchWeekday, body.date, body.date],
      ),
      pool.query<Row[]>(
        `SELECT dba.id, dba.fee_amount, dba.currency, d.name AS doctor_name
           FROM doctor_branch_assignments dba
           JOIN doctors d ON d.id = dba.doctor_id AND d.deleted_at IS NULL
          WHERE dba.doctor_id = ? AND dba.branch_id = ? AND dba.is_active = 1`,
        [body.doctor_id, body.branch_id],
      ),
      body.patient_details
        ? Promise.resolve(null)
        : pool.query<Row[]>(`SELECT name, phone FROM users WHERE id = ?`, [auth.userId]).then(([rows]) => rows),
    ]);

    // Branch-level gate checked first — it's the outermost constraint (a doctor can
    // never be bookable on a day/date the branch itself isn't open), so it gets its
    // own conflict code rather than being folded into DOCTOR_ON_LEAVE.
    if (!isWeekdayOpen(branchSchedule, branchWeekday) || findCoveringLeave(body.date, branchSchedule.closures)) {
      throw conflict("CLINIC_CLOSED", "The clinic is closed on the selected date.");
    }

    // Checked separately (and before the weekday/template match) so a booking blocked by
    // an active leave gets the specific DOCTOR_ON_LEAVE conflict rather than being folded
    // into the generic OUTSIDE_DOCTOR_AVAILABILITY case — this is what stops a client from
    // bypassing the disabled calendar day by calling the booking API directly.
    if (leaveRows[0]) {
      throw conflict("DOCTOR_ON_LEAVE", "Doctor is unavailable on the selected date.");
    }

    const template = templates[0];
    if (!template) {
      throw unprocessable(
        "OUTSIDE_DOCTOR_AVAILABILITY",
        "The doctor is not available on this date.",
      );
    }

    // Every generated key across all of today's templates (a doctor can have several
    // ranges per weekday with different durations/capacities, not just templates[0]).
    const capacityMap = buildSlotCapacityMap(templates);

    // Booking end-time rule: once every slot of today has ended in the branch's tz the
    // day is closed for new bookings (all roles) — reported as BOOKING_TIME_ENDED rather
    // than DOCTOR_FULLY_BOOKED so the client can tell "too late" from "no capacity".
    if (
      capacityMap.size > 0 &&
      [...capacityMap.entries()].every(([key, c]) => hasSlotEndedInTz(body.date, key, c.durationMinutes, tz))
    ) {
      throw unprocessable("BOOKING_TIME_ENDED", BOOKING_TIME_ENDED_MESSAGE, "time");
    }

    // Patients cannot book once the doctor's final slot for the day is within 30
    // minutes (fixed or sequential schedule alike); reception/clinic-owner walk-in
    // bookings are exempt, mirroring the patient-only checks above.
    if (auth.role === "patient" && isPastBookingCutoff(body.date, scheduleFinalEndTime(templates), tz)) {
      throw conflict(
        "BOOKING_CUTOFF_PASSED",
        "New bookings for this date are closed within 30 minutes of the doctor's last available slot.",
      );
    }

    const isSequential = template.slot_type === "sequential";
    let scheduledTime: string;

    if (isSequential) {
      const next = await findNextSequentialSlot(pool, body.doctor_id, body.branch_id, body.date, tz);
      if (!next) {
        throw conflict(
          "DOCTOR_FULLY_BOOKED",
          "No slots are left for this doctor on the selected date.",
        );
      }
      scheduledTime = next;
    } else {
      if (!body.time) {
        throw badRequest("VALIDATION_ERROR", "time is required.", "time");
      }
      if (!capacityMap.has(body.time)) {
        throw unprocessable(
          "OUTSIDE_DOCTOR_AVAILABILITY",
          "The requested time is not an available slot for this doctor.",
        );
      }
      // A slot can be booked until its END (start + duration) in the branch's tz.
      if (hasSlotEndedInTz(body.date, body.time, capacityMap.get(body.time)!.durationMinutes, tz)) {
        throw unprocessable("BOOKING_TIME_ENDED", BOOKING_TIME_ENDED_MESSAGE, "time");
      }
      scheduledTime = body.time;
    }

    const assignment = assignments[0];
    if (!assignment) throw notFound("DOCTOR_NOT_FOUND", "Doctor is not assigned to this branch.");

    // Defaults to the account holder's own name/phone when patient_details is omitted
    // (the common "booking for myself" case).
    let patientDetails: PatientDetailsInput = body.patient_details ?? {
      relationship: "self",
      name: selfRows?.[0]?.name ?? "Self",
      phone: selfRows?.[0]?.phone ?? null,
      age: null,
      gender: null,
    };

    const id = newId();
    let resolved: ResolvedServicePatient | null = null;
    const triedTimes = new Set<string>();
    let attemptsLeft = isSequential ? 25 : 1;
    for (;;) {
      const capacity = capacityMap.get(scheduledTime);
      const maxPatients = capacity?.maxPatients ?? 1;
      const dur = capacity?.durationMinutes ?? Number(template.slot_duration_minutes);
      let seq = 0;
      let inserted = false;
      // Try slot_seq 0, 1, 2... up to this slot's capacity — a duplicate-key error
      // means that particular seq is taken, so the next one is tried immediately
      // (same guarantee the old single-seq unique constraint gave for max_patients=1).
      while (seq < maxPatients) {
        try {
          await withTransaction(async (conn) => {
            await conn.query(
              `INSERT INTO appointments
                 (id, patient_id, clinic_id, branch_id, doctor_id, scheduled_date, scheduled_time, slot_seq, duration_minutes, status, fee_amount, currency)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
              [
                id,
                auth.userId,
                branch.clinic_id,
                body.branch_id,
                body.doctor_id,
                body.date,
                scheduledTime,
                seq,
                dur,
                assignment.fee_amount,
                assignment.currency,
              ],
            );
            const servicePatient = await resolveServicePatient(conn, auth, patientDetails);
            resolved = servicePatient;
            await conn.query(
              `INSERT INTO appointment_patients
                 (id, appointment_id, patient_id, booking_source, booked_by, profile_user_id, profile_name,
                  relationship, name, phone, age, gender)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newId(),
                id,
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
            const payload = {
              appointment_id: id,
              doctor_id: body.doctor_id,
              doctor_name: assignment.doctor_name,
              branch_name: branch.name,
              patient_id: auth.userId,
              date: body.date,
              time: scheduledTime,
              visitor_name: servicePatient.name,
              visitor_relationship: servicePatient.relationship,
            };
            await notifyBranchStaff(conn, body.branch_id, "new_booking", payload);
            await createClinicUserNotification(conn, branch.owner_user_id, "new_booking", payload, body.branch_id);
          });
          inserted = true;
          break;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          seq += 1;
        }
      }
      if (inserted) break;

      if (!isSequential) {
        throw conflict(
          "SLOT_ALREADY_BOOKED",
          "This time slot was just taken. Please choose another.",
        );
      }
      triedTimes.add(scheduledTime);
      attemptsLeft -= 1;
      const next: string | null =
        attemptsLeft > 0
          ? await findNextSequentialSlot(pool, body.doctor_id, body.branch_id, body.date, tz, triedTimes)
          : null;
      if (!next) {
        throw conflict(
          "DOCTOR_FULLY_BOOKED",
          "No slots are left for this doctor on the selected date.",
        );
      }
      scheduledTime = next;
    }

    // Assigned inside the insert transaction's callback, which TS can't follow.
    const done = resolved as ResolvedServicePatient | null;
    if (done) {
      patientDetails = { ...patientDetails, name: done.name, phone: done.phone, relationship: done.relationship };
    }

    // Independent reads — none depends on the others — so they run as one round trip.
    const [[rows], [details], recipients] = await Promise.all([
      pool.query<Row[]>(
        `SELECT a.*, ap.relationship AS visitor_relationship, ap.name AS visitor_name,
                ap.phone AS visitor_phone, ap.age AS visitor_age, ap.gender AS visitor_gender,
                ap.patient_id AS visitor_patient_id, ap.booking_source AS visitor_booking_source,
                ap.booked_by AS visitor_booked_by, ap.profile_user_id AS visitor_profile_user_id, ap.profile_name AS visitor_profile_name,
                (SELECT vu.photo_url FROM users vu WHERE vu.id = ap.patient_id) AS visitor_photo_url,
                (SELECT pu.photo_url FROM users pu WHERE pu.id = a.patient_id) AS patient_photo_url
           FROM appointments a
           LEFT JOIN appointment_patients ap ON ap.appointment_id = a.id
          WHERE a.id = ?`,
        [id],
      ),
      pool.query<Row[]>(
        `SELECT u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone,
                d.name AS doctor_name, b.name AS branch_name
           FROM appointments a
           JOIN users u ON u.id = a.patient_id
           JOIN doctors d ON d.id = a.doctor_id
           JOIN branches b ON b.id = a.branch_id
          WHERE a.id = ?`,
        [id],
      ),
      branchContactEmails(pool, body.branch_id),
    ]);
    const info = details[0];
    if (info) {
      const isForSelf = patientDetails.relationship === "self";
      const subject = `New appointment booked — ${patientDetails.name} with Dr. ${info.doctor_name}`;
      const emailBody = [
        `A new appointment has been booked at ${info.branch_name}.`,
        "",
        `Visiting patient: ${patientDetails.name}${isForSelf ? "" : ` (${patientDetails.relationship} of ${info.patient_name ?? "the account holder"})`}`,
        ...(patientDetails.phone ? [`Visiting patient phone: ${patientDetails.phone}`] : []),
        "",
        `Booked by: ${info.patient_name ?? "-"}`,
        `Email: ${info.patient_email ?? "-"}`,
        `Phone: ${info.patient_phone ?? "-"}`,
        "",
        `Doctor: Dr. ${info.doctor_name}`,
        `Date: ${body.date} at ${scheduledTime}`,
      ].join("\n");
      const emailHtmlBody = detailsEmailHtml({
        heading: "New Appointment Booked",
        intro: `A new appointment has been confirmed at ${info.branch_name}.`,
        rows: [
          { label: "Doctor", value: `Dr. ${info.doctor_name}` },
          { label: "Date & Time", value: `${body.date} at ${scheduledTime}` },
          {
            label: "Visiting Patient",
            value: patientDetails.name,
            sub: isForSelf
              ? patientDetails.phone
                ? `Phone: ${patientDetails.phone}`
                : undefined
              : `${patientDetails.relationship} of ${info.patient_name ?? "the account holder"}${patientDetails.phone ? ` · Phone: ${patientDetails.phone}` : ""}`,
          },
          {
            label: "Booked By",
            value: info.patient_name ?? "-",
            sub: `${info.patient_email ?? "-"} · Phone: ${info.patient_phone ?? "-"}`,
          },
        ],
      });
      // sendEmail already catches its own errors — no reason to hold
      // the response on the round trips once the booking itself is committed.
      void Promise.all(recipients.map((email) => sendEmail(email, subject, emailBody, emailHtmlBody)));

      // To the booking's profile (the Patient App account), never the staff member who booked it.
      const bookedBody = `${isForSelf ? "Your" : `${patientDetails.name}'s`} appointment with Dr. ${info.doctor_name} at ${info.branch_name} on ${body.date} at ${scheduledTime} has been booked and is awaiting confirmation from the clinic.`;
      void patientRecipient(pool, auth.userId, "new_booking", { appointment_id: id }).then(async (recipient) => {
        if (!recipient) return;
        const [to] = await pool.query<Row[]>(`SELECT email FROM users WHERE id = ?`, [recipient]);
        if (to[0]?.email) await sendEmail(to[0].email, "Appointment booked", bookedBody, patientEmailHtml(bookedBody));
      }).catch((err) => console.error("[email] appointment booked:", err));
    }

    return { status: 201, body: serializeAppointment(rows[0]) };
  });

  return json(result.body, result.status);
});

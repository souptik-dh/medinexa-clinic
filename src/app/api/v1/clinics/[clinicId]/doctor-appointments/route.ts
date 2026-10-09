import { api, json, requestOrigin } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { badRequest, notFound } from "@api/lib/errors";
import { getOwnedClinic } from "@api/lib/scope";
import { addDays, todayInTz } from "@api/lib/availability";
import { DOCUMENT_SELECT_JOIN, serializeDocument } from "@api/lib/patient-documents";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A doctor's appointments at this clinic for one day (default: tomorrow in each
// branch's timezone), each with the patient's details, medical profile, lab reports
// (clinic-issued at this clinic + patient-uploaded + lab tests booked here) and the
// prescriptions the patient uploaded from the app.
export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin", "doctor"]);
  const clinicId = ctx.params.clinicId;
  const sp = ctx.request.nextUrl.searchParams;
  const doctorId = sp.get("doctor_id");
  const dateParam = sp.get("date");
  const branchParam = sp.get("branch_id");

  if (!doctorId) throw badRequest("VALIDATION_ERROR", "doctor_id is required.", "doctor_id");
  if (dateParam && !DATE_RE.test(dateParam)) {
    throw badRequest("VALIDATION_ERROR", "date must be YYYY-MM-DD.", "date");
  }
  // A doctor may only look at their own patient list.
  if (auth.role === "doctor" && auth.doctorId !== doctorId) {
    throw notFound("DOCTOR_NOT_FOUND", "Doctor not found.");
  }

  if (auth.role === "clinic_owner") {
    await getOwnedClinic(pool, clinicId, auth.userId);
  } else {
    const [clinics] = await pool.query<Row[]>(
      `SELECT id FROM clinics WHERE id = ? AND deleted_at IS NULL`,
      [clinicId],
    );
    if (!clinics[0]) throw notFound("CLINIC_NOT_FOUND", "Clinic not found.");
  }

  // Branches of this clinic where the doctor is actively assigned.
  const branchWhere = ["b.clinic_id = ?", "b.deleted_at IS NULL", "dba.doctor_id = ?", "dba.is_active = 1"];
  const branchArgs: unknown[] = [clinicId, doctorId];
  if (auth.role === "branch_staff") {
    branchWhere.push("b.id = ?");
    branchArgs.push(auth.branchId ?? "__none__");
  }
  if (branchParam) {
    branchWhere.push("b.id = ?");
    branchArgs.push(branchParam);
  }
  const [branches] = await pool.query<Row[]>(
    `SELECT b.id, b.name, b.timezone
       FROM branches b
       JOIN doctor_branch_assignments dba ON dba.branch_id = b.id
      WHERE ${branchWhere.join(" AND ")}`,
    branchArgs,
  );

  const [doctors] = await pool.query<Row[]>(
    `SELECT id, name, doctor_degree, photo_url FROM doctors WHERE id = ? AND deleted_at IS NULL`,
    [doctorId],
  );
  if (!doctors[0] || branches.length === 0) {
    throw notFound("DOCTOR_NOT_FOUND", "Doctor is not assigned to this clinic.");
  }
  const doctor = doctors[0];

  const pairs = branches.map((b) => ({
    branchId: String(b.id),
    date: dateParam ?? addDays(todayInTz(b.timezone), 1),
  }));

  const [appts] = await pool.query<Row[]>(
    `SELECT a.id, a.branch_id, b.name AS branch_name, b.photo_url AS branch_photo_url, a.scheduled_date, a.scheduled_time,
            a.duration_minutes, a.status, a.fee_amount, a.currency, a.payment_method, a.created_at,
            COALESCE(ap.patient_id, a.patient_id) AS subject_id,
            ap.relationship, ap.name AS ap_name, ap.phone AS ap_phone, ap.age AS ap_age,
            ap.gender AS ap_gender, ap.booking_source,
            u.name AS u_name, u.email AS u_email, u.phone AS u_phone, u.date_of_birth, u.gender AS u_gender,
            u.height_cm, u.weight_kg, u.bmi, u.address, u.city, u.photo_url,
            bu.id AS booked_by_id, bu.name AS booked_by_name, bu.phone AS booked_by_phone,
            bu.photo_url AS booked_by_photo_url
       FROM appointments a
       JOIN branches b ON b.id = a.branch_id
       JOIN users bu ON bu.id = a.patient_id
       LEFT JOIN appointment_patients ap ON ap.appointment_id = a.id
       LEFT JOIN users u ON u.id = COALESCE(ap.patient_id, a.patient_id)
      WHERE a.doctor_id = ? AND a.status != 'cancelled'
        AND (${pairs.map(() => "(a.branch_id = ? AND a.scheduled_date = ?)").join(" OR ")})
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.slot_seq ASC`,
    [doctorId, ...pairs.flatMap((p) => [p.branchId, p.date])],
  );

  const patientIds = [...new Set(appts.map((a) => String(a.subject_id)))];
  const origin = requestOrigin(ctx.request);

  type Grouped = Map<string, Row[]>;
  const group = (rows: Row[], key: string): Grouped => {
    const m: Grouped = new Map();
    for (const r of rows) {
      const k = String(r[key]);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };

  let profiles: Grouped = new Map();
  let medicalDocs: Grouped = new Map();
  let labPrescriptions: Grouped = new Map();
  let clinicReports: Grouped = new Map();
  let labTests: Grouped = new Map();

  if (patientIds.length > 0) {
    const [[profileRows], [medRows], [ltpRows], [reportRows], [labRows]] = await Promise.all([
      pool.query<Row[]>(`SELECT * FROM patient_medical_profile WHERE patient_id IN (?)`, [patientIds]),
      pool.query<Row[]>(
        `SELECT id, patient_id, category, file_url, file_name, mime_type, size_bytes, uploaded_at
           FROM medical_documents
          WHERE patient_id IN (?) AND category IN ('prescription','lab_report')
          ORDER BY uploaded_at DESC`,
        [patientIds],
      ),
      pool.query<Row[]>(
        `SELECT id, patient_id, appointment_id, file_url, file_name, mime_type, file_size, uploaded_at
           FROM lab_test_prescriptions WHERE patient_id IN (?) ORDER BY uploaded_at DESC`,
        [patientIds],
      ),
      pool.query<Row[]>(
        `${DOCUMENT_SELECT_JOIN}
          WHERE pd.patient_id IN (?) AND pd.clinic_id = ? AND pd.document_type = 'LAB_REPORT'
            AND pd.deleted_at IS NULL
          ORDER BY pd.uploaded_at DESC`,
        [patientIds, clinicId],
      ),
      pool.query<Row[]>(
        `SELECT lta.id, COALESCE(ltap.patient_id, lta.patient_id) AS patient_id, lta.appointment_number,
                lta.appointment_date, lta.start_time,
                lta.status, lta.service_mode, lta.payment_status, lta.completed_at,
                lt.name AS test_name, lt.code AS test_code, lt.category AS test_category,
                b.name AS branch_name, b.photo_url AS branch_photo_url
           FROM lab_test_appointments lta
           JOIN lab_tests lt ON lt.id = lta.test_id
           JOIN branches b ON b.id = lta.branch_id
           LEFT JOIN lab_test_appointment_patients ltap ON ltap.appointment_id = lta.id
          -- The person the test was for, not the account that booked it (staff or a relative).
          WHERE COALESCE(ltap.patient_id, lta.patient_id) IN (?) AND lta.clinic_id = ?
          ORDER BY lta.appointment_date DESC, lta.start_time DESC`,
        [patientIds, clinicId],
      ),
    ]);
    profiles = group(profileRows, "patient_id");
    medicalDocs = group(medRows, "patient_id");
    labPrescriptions = group(ltpRows, "patient_id");
    clinicReports = group(reportRows, "patient_id");
    labTests = group(labRows, "patient_id");
  }

  const fileOut = (r: Row, source: string, labTestAppointmentId: string | null = null) => ({
    id: r.id,
    source,
    file_name: r.file_name,
    file_url: r.file_url,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes ?? r.file_size),
    uploaded_at: r.uploaded_at,
    lab_test_appointment_id: labTestAppointmentId,
  });

  const items = appts.map((a) => {
    const pid = String(a.subject_id);
    const docs = medicalDocs.get(pid) ?? [];
    const profile = profiles.get(pid)?.[0];

    // lab_test_prescriptions rows are copied from medical_documents with the same id
    // when a patient attaches an existing upload to a lab booking — skip those dupes.
    const prescriptions = docs.filter((d) => d.category === "prescription").map((d) => fileOut(d, "medical_documents"));
    const seen = new Set(prescriptions.map((p) => String(p.id)));
    for (const p of labPrescriptions.get(pid) ?? []) {
      if (seen.has(String(p.id))) continue;
      prescriptions.push(fileOut(p, "lab_test_booking", String(p.appointment_id)));
    }

    return {
      appointment_id: a.id,
      branch_id: a.branch_id,
      branch_name: a.branch_name,
      branch_photo_url: a.branch_photo_url ?? null,
      date: String(a.scheduled_date).slice(0, 10),
      time: a.scheduled_time,
      duration_minutes: Number(a.duration_minutes),
      status: a.status,
      fee_amount: Number(a.fee_amount),
      currency: a.currency,
      payment_method: a.payment_method,
      booking_source: a.booking_source ?? null,
      booked_by: { id: a.booked_by_id, name: a.booked_by_name, phone: a.booked_by_phone, photo_url: a.booked_by_photo_url ?? null },
      patient: {
        patient_id: a.subject_id,
        relationship: a.relationship ?? "self",
        name: a.ap_name ?? a.u_name,
        phone: a.ap_phone ?? a.u_phone,
        email: a.u_email ?? null,
        age: a.ap_age ?? null,
        date_of_birth: a.date_of_birth ?? null,
        gender: a.ap_gender ?? a.u_gender ?? null,
        height_cm: a.height_cm != null ? Number(a.height_cm) : null,
        weight_kg: a.weight_kg != null ? Number(a.weight_kg) : null,
        bmi: a.bmi != null ? Number(a.bmi) : null,
        address: a.address ?? null,
        city: a.city ?? null,
        photo_url: a.photo_url ?? null,
        medical_profile: profile
          ? {
              blood_group: profile.blood_group,
              allergies: profile.allergies,
              medical_conditions: profile.medical_conditions,
              current_medications: profile.current_medications,
              previous_surgeries: profile.previous_surgeries,
              medical_notes: profile.medical_notes,
              emergency_contact: {
                name: profile.emergency_contact_name,
                relationship: profile.emergency_contact_relationship,
                phone: profile.emergency_contact_phone,
              },
            }
          : null,
      },
      lab_reports: {
        clinic_issued: (clinicReports.get(pid) ?? []).map((r) => serializeDocument(r, origin)),
        patient_uploaded: docs.filter((d) => d.category === "lab_report").map((d) => fileOut(d, "medical_documents")),
        lab_tests: (labTests.get(pid) ?? []).map((t) => ({
          id: t.id,
          appointment_number: t.appointment_number,
          test_name: t.test_name,
          test_code: t.test_code,
          test_category: t.test_category,
          branch_name: t.branch_name,
          branch_photo_url: t.branch_photo_url ?? null,
          date: String(t.appointment_date).slice(0, 10),
          time: t.start_time,
          service_mode: t.service_mode,
          status: t.status,
          payment_status: t.payment_status,
          completed_at: t.completed_at,
        })),
      },
      uploaded_prescriptions: prescriptions,
    };
  });

  return json({
    clinic_id: clinicId,
    doctor: { doctor_id: doctor.id, name: doctor.name, degree: doctor.doctor_degree, photo_url: doctor.photo_url ?? null },
    dates: [...new Set(pairs.map((p) => p.date))],
    total: items.length,
    appointments: items,
  });
});

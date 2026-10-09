import { api, json, requestOrigin } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool, withTransaction } from "@api/lib/db";
import { newId } from "@api/lib/ids";
import { badRequest, notFound } from "@api/lib/errors";
import { uploadDocumentToCloudinary } from "@api/lib/cloudinary";
import { assertClinicOperational } from "@api/lib/subscriptions";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { createPatientNotification, emailPatient } from "@api/lib/notifications";
import {
  DOCUMENT_TYPES,
  DOCUMENT_MIMES,
  MAX_DOCUMENT_BYTES,
  DOCUMENT_SELECT_JOIN,
  resolveDocumentBranch,
  assertPatientExists,
  serializeDocument,
  recordDelivery,
  auditPatientDocumentAction,
  type DocumentType,
} from "@api/lib/patient-documents";
import type { RowDataPacket } from "mysql2/promise";

function requireField(form: FormData, key: string, max: number): string {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw badRequest("VALIDATION_ERROR", `${key} is required.`, key);
  }
  const value = raw.trim();
  if (value.length > max) {
    throw badRequest("VALIDATION_ERROR", `${key} must be at most ${max} characters.`, key);
  }
  return value;
}

function parseDocumentType(form: FormData): DocumentType {
  const raw = form.get("document_type");
  if (typeof raw === "string" && (DOCUMENT_TYPES as readonly string[]).includes(raw)) {
    return raw as DocumentType;
  }
  throw badRequest(
    "VALIDATION_ERROR",
    `document_type must be one of: ${DOCUMENT_TYPES.join(", ")}.`,
    "document_type",
  );
}

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  const form = await ctx.request.formData();

  const patientId = requireField(form, "patient_id", 36);
  const documentType = parseDocumentType(form);
  const title = requireField(form, "title", 255);
  const descriptionRaw = form.get("description");
  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim().slice(0, 2000)
      : null;
  const requestedBranchId = typeof form.get("branch_id") === "string" ? (form.get("branch_id") as string) : null;
  // A PRESCRIPTION for a lab booking made at reception: attached to that booking so it
  // counts as the booking's prescription (needed to confirm a prescription-required test).
  const rawLabAppt = form.get("lab_test_appointment_id");
  const labAppointmentId = typeof rawLabAppt === "string" && rawLabAppt.trim() ? rawLabAppt.trim() : null;
  if (labAppointmentId && documentType !== "PRESCRIPTION") {
    throw badRequest("VALIDATION_ERROR", "Only a prescription can be attached to a lab booking.", "document_type");
  }

  // clinic_id/branch_id are resolved+verified server-side (never trusted from the
  // client) — pinned to the staff member's own branch, or checked against the
  // owner's actual branches.
  const { branchId, clinicId } = await resolveDocumentBranch(pool, auth, requestedBranchId);
  await assertPatientExists(pool, patientId);
  if (auth.role === "branch_staff") {
    await assertBranchStaffPermission(pool, auth, branchId, "patient_documents:upload");
  }
  await assertClinicOperational(pool, clinicId);

  if (labAppointmentId) {
    // Same clinic/branch, and the document's patient is the one the test is for.
    const [labRows] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.branch_id, a.clinic_id, a.patient_id, ltap.patient_id AS visitor_patient_id
         FROM lab_test_appointments a
         LEFT JOIN lab_test_appointment_patients ltap ON ltap.appointment_id = a.id
        WHERE a.id = ?`,
      [labAppointmentId],
    );
    const lab = labRows[0];
    const samePatient = lab && (lab.visitor_patient_id ?? lab.patient_id) === patientId;
    if (!lab || lab.clinic_id !== clinicId || lab.branch_id !== branchId || !samePatient) {
      throw notFound("APPOINTMENT_NOT_FOUND", "Lab test appointment not found.");
    }
  }

  const file = form.get("file");
  // Uploaded to Cloudinary rather than local disk — this API is served from Render,
  // where the local filesystem is wiped on every redeploy/restart (see the note in
  // send-email/route.ts), so patient documents need storage that outlives the dyno.
  const saved = await uploadDocumentToCloudinary(file, "patient-document", MAX_DOCUMENT_BYTES, DOCUMENT_MIMES);
  const originalName = file instanceof File ? file.name : "document";

  const id = newId();
  await withTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO patient_documents
         (id, patient_id, clinic_id, branch_id, document_type, title, description,
          file_name, file_key, file_size, mime_type, uploaded_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED')`,
      [
        id,
        patientId,
        clinicId,
        branchId,
        documentType,
        title,
        description,
        originalName,
        saved.url,
        saved.size,
        saved.mime,
        auth.userId,
      ],
    );
    // Every generated document is immediately available in the patient app — recorded
    // as its own delivery-history row (APP channel), same as EMAIL/PRINT.
    await recordDelivery(conn, {
      documentId: id,
      method: "APP",
      status: "DELIVERED",
      deliveredAt: new Date(),
      attemptedBy: auth.userId,
    });
    if (labAppointmentId) {
      await conn.query(
        `INSERT INTO lab_test_prescriptions (id, patient_id, appointment_id, file_name, file_url, mime_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, patientId, labAppointmentId, originalName, saved.url, saved.mime, saved.size],
      );
      // The first prescription attached becomes the booking's prescription.
      await conn.query(
        `UPDATE lab_test_appointments SET prescription_id = COALESCE(prescription_id, ?) WHERE id = ?`,
        [id, labAppointmentId],
      );
    }
    await auditPatientDocumentAction(conn, auth.userId, "document_uploaded", id, {
      patient_id: patientId,
      clinic_id: clinicId,
      branch_id: branchId,
      document_type: documentType,
    });
  });

  const notifyPayload = {
    document_id: id,
    title,
    document_type: documentType,
    description,
  };
  await createPatientNotification(pool, patientId, "patient_document_uploaded", notifyPayload);
  await emailPatient(pool, patientId, "patient_document_uploaded", notifyPayload);

  const [rows] = await pool.query<RowDataPacket[]>(`${DOCUMENT_SELECT_JOIN} WHERE pd.id = ?`, [id]);
  return json(serializeDocument(rows[0], requestOrigin(ctx.request)), 201);
});

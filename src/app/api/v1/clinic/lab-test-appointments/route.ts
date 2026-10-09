import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { serializeLabTestAppointment, labApptScopeWhere } from "@api/lib/lab-tests";
import { parsePagination } from "@api/lib/validators";
import { encodeCursor, decodeCursor } from "@api/lib/http";
import type { RowDataPacket } from "mysql2/promise";

export const GET = api({ rateLimit: 120 }, async (ctx) => {
  requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const sp = ctx.request.nextUrl.searchParams;
  const branchId = sp.get("branch_id");
  const status = sp.get("status");
  const testId = sp.get("test_id");
  const serviceMode = sp.get("service_mode");
  const paymentStatus = sp.get("payment_status");
  const patientName = sp.get("patient_name");
  const appointmentNumber = sp.get("appointment_number");
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");
  const { limit, cursor } = parsePagination(sp);

  const { where: scopeWhere, params: scopeParams } = labApptScopeWhere(ctx.auth!);
  const conditions = [scopeWhere];
  const params: unknown[] = [...scopeParams];

  if (branchId) {
    conditions.push("a.branch_id = ?");
    params.push(branchId);
  }
  if (status) {
    conditions.push("a.status = ?");
    params.push(status.toUpperCase());
  }
  if (testId) {
    conditions.push("a.test_id = ?");
    params.push(testId);
  }
  if (serviceMode) {
    conditions.push("a.service_mode = ?");
    params.push(serviceMode.toUpperCase());
  }
  if (paymentStatus) {
    conditions.push("a.payment_status = ?");
    params.push(paymentStatus.toUpperCase());
  }
  if (patientName) {
    // The patient's name, or the booking account's (a reception booking's account is staff).
    const like = `%${patientName.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    conditions.push("(ltap.name LIKE ? OR u.name LIKE ?)");
    params.push(like, like);
  }
  if (appointmentNumber) {
    conditions.push("a.appointment_number = ?");
    params.push(appointmentNumber);
  }
  if (dateFrom) {
    conditions.push("a.appointment_date >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("a.appointment_date <= ?");
    params.push(dateTo);
  }

  // Rows are ordered by status/date/time, not created_at, so a created_at
  // keyset would skip or repeat rows — the cursor carries an offset instead.
  const rawOffset = Number(decodeCursor(cursor)?.offset);
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const where = conditions.join(" AND ");

  const [rows] = await pool.query<RowDataPacket[]>(
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
     WHERE ${where}
     ORDER BY
       CASE a.status
         WHEN 'PENDING' THEN 0
         WHEN 'APPROVED' THEN 1
         WHEN 'COMPLETED' THEN 2
         WHEN 'REJECTED' THEN 3
         WHEN 'CANCELLED' THEN 4
       END ASC,
       a.appointment_date DESC, a.start_time DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit + 1, offset],
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? encodeCursor({ offset: offset + items.length }) : null;

  return json({ items: items.map(serializeLabTestAppointment), next_cursor: nextCursor });
});

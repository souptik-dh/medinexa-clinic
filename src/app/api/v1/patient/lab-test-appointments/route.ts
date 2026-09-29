import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { serializeLabTestAppointment, labApptScopeWhere } from "@api/lib/lab-tests";
import { parsePagination } from "@api/lib/validators";
import { encodeCursor, decodeCursor } from "@api/lib/http";
import type { RowDataPacket } from "mysql2/promise";

export const GET = api({ rateLimit: 120 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient"]);
  const sp = ctx.request.nextUrl.searchParams;
  const status = sp.get("status");
  const upcoming = sp.get("upcoming");
  const past = sp.get("past");
  const { limit, cursor } = parsePagination(sp);

  const conditions = ["a.patient_id = ?"];
  const params: unknown[] = [auth.userId];

  if (status) {
    conditions.push("a.status = ?");
    params.push(status.toUpperCase());
  }

  const today = new Date().toISOString().slice(0, 10);
  if (upcoming === "true") {
    conditions.push("(a.appointment_date > ? OR (a.appointment_date = ? AND a.start_time >= ?))");
    const now = new Date();
    params.push(today, today, `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`);
  }
  if (past === "true") {
    conditions.push("(a.appointment_date < ? OR (a.appointment_date = ? AND a.start_time < ?))");
    const now = new Date();
    params.push(today, today, `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`);
  }


  // Rows are ordered by status/date/time, not created_at, so a created_at
  // keyset would skip or repeat rows — the cursor carries an offset instead.
  const rawOffset = Number(decodeCursor(cursor)?.offset);
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const where = conditions.join(" AND ");

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, lt.name AS test_name, lt.code AS test_code, lt.category AS test_category,
            b.name AS branch_name, c.name AS clinic_name,
            b.photo_url AS branch_photo_url,
            (SELECT bu.photo_url FROM users bu WHERE bu.id = a.patient_id) AS patient_photo_url,
            (SELECT vu.photo_url FROM users vu WHERE vu.id = ltap.patient_id) AS visitor_photo_url,
            ltap.relationship AS visitor_relationship, ltap.name AS visitor_name,
            ltap.phone AS visitor_phone, ltap.age AS visitor_age, ltap.gender AS visitor_gender,
            ltap.patient_id AS visitor_patient_id, ltap.booking_source AS visitor_booking_source,
            ltap.booked_by AS visitor_booked_by
       FROM lab_test_appointments a
       JOIN lab_tests lt ON lt.id = a.test_id
       JOIN branches b ON b.id = a.branch_id
       JOIN clinics c ON c.id = a.clinic_id
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

  return json({
    items: items.map(serializeLabTestAppointment),
    next_cursor: nextCursor,
  });
});

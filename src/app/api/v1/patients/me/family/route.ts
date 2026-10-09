import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { patientCode } from "@api/lib/appointments";

// The people this Patient App account books for (patient_family_links). Members are
// added automatically when the account books for someone else, or when reception books
// a relative under this account. The app lists them so a repeat booking sends the
// member's patient_id instead of re-typing details.
export const GET = api({ rateLimit: 120 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient"]);
  const [rows] = await pool.query<Row[]>(
    `SELECT u.id, u.name, u.phone, u.gender, u.date_of_birth, u.photo_url, l.relationship, l.created_at,
            COALESCE(
              TIMESTAMPDIFF(YEAR, u.date_of_birth, CURDATE()),
              (SELECT ap.age FROM appointment_patients ap
                WHERE ap.patient_id = u.id AND ap.age IS NOT NULL ORDER BY ap.created_at DESC LIMIT 1),
              (SELECT lp.age FROM lab_test_appointment_patients lp
                WHERE lp.patient_id = u.id AND lp.age IS NOT NULL ORDER BY lp.created_at DESC LIMIT 1)
            ) AS age
       FROM patient_family_links l
       JOIN users u ON u.id = l.patient_id
      WHERE l.profile_user_id = ?
      ORDER BY u.name ASC`,
    [auth.userId],
  );
  return json({
    items: rows.map((r) => ({
      id: r.id,
      patient_code: patientCode(r.id),
      name: r.name,
      phone: r.phone ?? null,
      gender: r.gender ?? null,
      date_of_birth: r.date_of_birth ?? null,
      age: r.age !== null && r.age !== undefined ? Number(r.age) : null,
      photo_url: r.photo_url ?? null,
      relationship: r.relationship,
      linked_at: r.created_at,
    })),
  });
});

import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { loadPatientLinks } from "@api/lib/patient-links";
import { requireRoles } from "@api/lib/auth";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { badRequest } from "@api/lib/errors";
import { patientCode } from "@api/lib/appointments";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** "98765 43210" / "+91 98765-43210" / "919876543210" → "+919876543210"; null when not a mobile. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

// Lets reception find an existing patient before booking — by name, phone (any
// format) or Patient ID (the first characters of the id) — so they are booked by
// patient_id instead of creating a duplicate. Each result also lists its links:
// `family` = people this account books for, `profiles` = accounts that book for this
// person. Not branch-scoped — patients aren't owned by a clinic/branch.
export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["branch_staff", "clinic_owner"]);
  if (auth.role === "branch_staff") {
    await assertBranchStaffPermission(pool, auth, auth.branchId ?? "__none__", "patients:view");
  }

  const sp = ctx.request.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const phone = sp.get("phone")?.trim();
  if (!q && !phone) {
    throw badRequest("VALIDATION_ERROR", "Provide `q` or `phone` to search for a patient.");
  }

  const whereParts = ["u.role = 'patient'"];
  const params: unknown[] = [];
  if (phone) {
    whereParts.push("u.phone = ?");
    params.push(normalizePhone(phone) ?? phone);
  } else if (q) {
    const like = `%${escapeLike(q)}%`;
    const ors = ["u.name LIKE ?", "u.phone LIKE ?", "u.email LIKE ?"];
    params.push(like, like, like);
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) {
      // A phone typed with spaces, dashes or +91 still matches the stored form.
      ors.push("u.phone LIKE ?");
      params.push(`%${digits.length > 10 ? digits.slice(-10) : digits}%`);
    }
    if (/^[0-9a-f-]{4,36}$/i.test(q)) {
      ors.push("u.id LIKE ?");
      params.push(`${q.toLowerCase()}%`);
    }
    whereParts.push(`(${ors.join(" OR ")})`);
  }

  const [rows] = await pool.query<Row[]>(
    `SELECT u.id, u.name, u.email, u.phone, u.gender, u.date_of_birth, u.photo_url,
            (u.password_hash IS NOT NULL) AS is_registered,
            COALESCE(
              TIMESTAMPDIFF(YEAR, u.date_of_birth, CURDATE()),
              (SELECT ap.age FROM appointment_patients ap
                WHERE ap.patient_id = u.id AND ap.age IS NOT NULL ORDER BY ap.created_at DESC LIMIT 1),
              (SELECT lp.age FROM lab_test_appointment_patients lp
                WHERE lp.patient_id = u.id AND lp.age IS NOT NULL ORDER BY lp.created_at DESC LIMIT 1)
            ) AS age
       FROM users u
      WHERE ${whereParts.join(" AND ")}
      ORDER BY u.name ASC
      LIMIT 20`,
    params,
  );

  const { family, profiles } = await loadPatientLinks(pool, rows.map((r) => String(r.id)));

  return json({
    items: rows.map((r) => ({
      id: r.id,
      patient_code: patientCode(r.id),
      name: r.name,
      email: r.email,
      phone: r.phone,
      gender: r.gender ?? null,
      date_of_birth: r.date_of_birth ?? null,
      age: r.age !== null && r.age !== undefined ? Number(r.age) : null,
      photo_url: r.photo_url ?? null,
      is_registered: Boolean(r.is_registered),
      family: family.get(String(r.id)) ?? [],
      profiles: profiles.get(String(r.id)) ?? [],
    })),
  });
});

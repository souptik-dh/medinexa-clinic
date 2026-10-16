import type { ResultSetHeader } from "mysql2/promise";
import { api, noContent } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { notFound } from "@api/lib/errors";

// Removes a person from this account's family list. Only the link goes: the person's
// patient record and every past booking stay untouched.
export const DELETE = api({ rateLimit: 60 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient"]);
  const { patientId } = ctx.params;
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM patient_family_links WHERE profile_user_id = ? AND patient_id = ?`,
    [auth.userId, patientId],
  );
  if (result.affectedRows === 0) throw notFound("PATIENT_NOT_FOUND", "Family member not found.");
  return noContent();
});

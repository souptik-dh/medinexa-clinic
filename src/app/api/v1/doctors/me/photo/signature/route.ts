import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { notFound } from "@api/lib/errors";
import { createImageUploadSignature } from "@api/lib/cloudinary";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["doctor"]);
  const [rows] = await pool.query<Row[]>(
    `SELECT id FROM doctors WHERE id = ? AND deleted_at IS NULL`,
    [auth.doctorId],
  );
  if (!rows[0]) throw notFound("DOCTOR_NOT_FOUND", "Doctor profile not found.");
  return json(createImageUploadSignature("doctors"));
});

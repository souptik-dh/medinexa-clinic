import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { notFound } from "@api/lib/errors";
import { parseBody } from "@api/lib/validators";
import { assertPublicId, cloudinaryImageUrl, getCloudinary } from "@api/lib/cloudinary";
import { requireBranchAccess } from "@api/lib/permissions";

const schema = z.object({
  public_id: z.string().trim().min(1).max(255),
});

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  await requireBranchAccess(pool, auth, ctx.params.id, "doctors:manage");

  const [rows] = await pool.query<Row[]>(
    `SELECT d.id
       FROM doctor_branch_assignments dba
       JOIN doctors d ON d.id = dba.doctor_id AND d.deleted_at IS NULL
      WHERE dba.branch_id = ? AND dba.doctor_id = ? AND dba.is_active = 1`,
    [ctx.params.id, ctx.params.doctorId],
  );
  if (!rows[0]) throw notFound("DOCTOR_NOT_FOUND", "Doctor is not assigned to this branch.");

  const body = parseBody(schema, await readJson(ctx.request));
  const publicId = assertPublicId(body.public_id, "doctors");
  const photoUrl = cloudinaryImageUrl(getCloudinary().cloudName, publicId);

  await pool.query(`UPDATE doctors SET photo_url = ? WHERE id = ?`, [photoUrl, ctx.params.doctorId]);
  return json({ photo_url: photoUrl });
});

import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { parseBody } from "@api/lib/validators";
import { notFound } from "@api/lib/errors";
import { getOwnedBranch } from "@api/lib/scope";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { assertPublicId, cloudinaryImageUrl, deleteCloudinaryAsset, getCloudinary } from "@api/lib/cloudinary";

const schema = z.object({
  public_id: z.string().trim().min(1).max(255),
});

/**
 * Sets a staff member's profile photo on their behalf (the branch's owner, or staff
 * with staff:manage). Same photo as POST /branch-staff/me/photo — it lives on the user.
 */
export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  const { id: branchId, staffId } = ctx.params;

  if (auth.role === "clinic_owner") {
    await getOwnedBranch(pool, branchId, auth.userId);
  } else {
    await assertBranchStaffPermission(pool, auth, branchId, "staff:manage");
  }

  const body = parseBody(schema, await readJson(ctx.request));
  const publicId = assertPublicId(body.public_id, "branch-staff");
  const photoUrl = cloudinaryImageUrl(getCloudinary().cloudName, publicId);

  const [rows] = await pool.query<Row[]>(
    `SELECT u.id AS user_id, u.photo_url
       FROM branch_staff bs
       JOIN users u ON u.id = bs.user_id
      WHERE bs.id = ? AND bs.branch_id = ?`,
    [staffId, branchId],
  );
  const staff = rows[0];
  if (!staff) throw notFound("STAFF_NOT_FOUND", "Staff member not found.");

  await pool.query(`UPDATE users SET photo_url = ? WHERE id = ?`, [photoUrl, staff.user_id]);
  if (staff.photo_url !== photoUrl) await deleteCloudinaryAsset(staff.photo_url);
  return json({ photo_url: photoUrl });
});

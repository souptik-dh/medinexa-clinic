import { api, noContent } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedBranch } from "@api/lib/scope";
import { notFound } from "@api/lib/errors";

export const DELETE = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  const { id: branchId, imageId } = ctx.params;
  await getOwnedBranch(pool, branchId, auth.userId);

  const [rows] = await pool.query<Row[]>(
    `SELECT id FROM branch_gallery_images WHERE id = ? AND branch_id = ?`,
    [imageId, branchId],
  );
  if (!rows[0]) throw notFound("IMAGE_NOT_FOUND", "Gallery image not found.");

  await pool.query(`DELETE FROM branch_gallery_images WHERE id = ?`, [imageId]);
  return noContent();
});

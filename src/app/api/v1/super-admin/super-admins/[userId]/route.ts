import { api, json, noContent, clientIp } from "@api/lib/http";
import { withTransaction } from "@api/lib/db";
import { requireSuperAdmin, logSuperAdminAction } from "@api/lib/super-admin";
import { notFound } from "@api/lib/errors";

/** Revokes Super Admin privileges from a user. */
export const DELETE = api({ rateLimit: 200 }, async (ctx) => {
  const admin = await requireSuperAdmin(ctx.auth);
  const { userId } = ctx.params;

  if (admin.userId === userId) {
    return json(
      { error: { code: "CANNOT_REVOKE_SELF", message: "You cannot revoke your own Super Admin privileges.", field: null } },
      409,
    );
  }

  await withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT user_id FROM super_admins WHERE user_id = ? AND revoked_at IS NULL`, [userId]);
    if (!Array.isArray(rows) || rows.length === 0) throw notFound("SUPER_ADMIN_NOT_FOUND", "No active Super Admin with that id.");
    await conn.query(`UPDATE super_admins SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL`, [userId]);
    await logSuperAdminAction(conn, {
      actorUserId: admin.userId,
      action: "super_admin.revoked",
      resourceType: "super_admin",
      resourceId: userId,
      ipAddress: clientIp(ctx.request),
    });
  });

  return noContent();
});

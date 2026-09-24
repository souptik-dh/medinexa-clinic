import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { notFound } from "@api/lib/errors";
import { loadStaffPermissions } from "@api/lib/permissions";

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["branch_staff"]);
  if (!auth.branchId) {
    throw notFound("BRANCH_NOT_FOUND", "No branch is assigned to this account.");
  }

  const [rows] = await pool.query<Row[]>(
    `SELECT b.id AS branch_id, b.name AS branch_name, b.address, b.phone, b.timezone,
            c.id AS clinic_id, c.name AS clinic_name
       FROM branches b
       JOIN clinics c ON c.id = b.clinic_id AND c.deleted_at IS NULL
      WHERE b.id = ? AND b.deleted_at IS NULL`,
    [auth.branchId],
  );
  const row = rows[0];
  if (!row) {
    throw notFound("BRANCH_NOT_FOUND", "No branch is assigned to this account.");
  }

  const permissions = await loadStaffPermissions(pool, auth.branchId, auth.userId);

  return json({
    clinic: { id: row.clinic_id, name: row.clinic_name },
    branch: {
      id: row.branch_id,
      name: row.branch_name,
      address: row.address,
      phone: row.phone,
      timezone: row.timezone,
    },
    permissions,
  });
});

import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import type { RowDataPacket } from "mysql2/promise";

// Categories of the active predefined tests, with how many tests each has.
export const GET = api({ rateLimit: 120 }, async (ctx) => {
  requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT category AS name, COUNT(*) AS count FROM lab_test_library
      WHERE status = 'active' GROUP BY category ORDER BY category ASC`,
  );
  return json({ items: rows.map((r) => ({ name: r.name, count: Number(r.count) })) });
});

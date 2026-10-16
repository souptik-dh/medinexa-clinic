import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { badRequest } from "@api/lib/errors";
import { getOwnedClinic } from "@api/lib/scope";
import { loadActiveScheduleDays } from "@api/lib/lab-test-library";
import type { RowDataPacket } from "mysql2/promise";

// The lab schedules a test can be added under: one per branch the caller may manage,
// with its active weekdays. `valid` is false when the branch has no active day — the
// add-tests endpoints reject such a branch with LAB_SCHEDULE_REQUIRED.
export const GET = api({ rateLimit: 120 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const clinicId = ctx.request.nextUrl.searchParams.get("clinic_id");

  const conditions = ["b.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (auth.role === "branch_staff") {
    conditions.push("b.id = ?");
    params.push(auth.branchId ?? "__none__");
  } else {
    if (!clinicId) throw badRequest("VALIDATION_ERROR", "clinic_id is required.", "clinic_id");
    if (auth.role === "clinic_owner") await getOwnedClinic(pool, clinicId, auth.userId);
    conditions.push("b.clinic_id = ?");
    params.push(clinicId);
  }

  const [branches] = await pool.query<RowDataPacket[]>(
    `SELECT b.id, b.name, b.is_main, b.timezone,
            (SELECT COUNT(*) FROM branch_lab_tests blt WHERE blt.branch_id = b.id AND blt.status = 'active') AS test_count
       FROM branches b
      WHERE ${conditions.join(" AND ")}
      ORDER BY b.is_main DESC, b.name ASC`,
    params,
  );
  const days = await loadActiveScheduleDays(pool, branches.map((b) => b.id));

  return json({
    items: branches.map((b) => {
      const active = days.get(b.id) ?? [];
      return {
        branch_id: b.id,
        branch_name: b.name,
        is_main: Boolean(b.is_main),
        timezone: b.timezone ?? null,
        valid: active.length > 0,
        days: active,
        test_count: Number(b.test_count),
      };
    }),
  });
});

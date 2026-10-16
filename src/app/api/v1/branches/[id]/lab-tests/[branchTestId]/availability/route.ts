import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { getBranchLabTestInScope } from "@api/lib/lab-tests";
import { generateLabTestSlots } from "@api/lib/lab-test-availability";
import { badRequest, notFound } from "@api/lib/errors";
import type { RowDataPacket } from "mysql2/promise";

export const GET = api({ rateLimit: 120 }, async (ctx) => {
  requireRoles(ctx.auth, ["patient", "clinic_owner", "branch_staff", "sys_admin"]);
  const { id: branchId, branchTestId } = ctx.params;
  const sp = ctx.request.nextUrl.searchParams;
  const date = sp.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw badRequest("VALIDATION_ERROR", "Query parameter 'date' is required (YYYY-MM-DD).");
  }

  const blt = await getBranchLabTestInScope(pool, branchTestId, ctx.auth!);
  // Slots are marked `ended` against the branch's own clock, not the server's.
  const [branchRows] = await pool.query<RowDataPacket[]>(
    `SELECT timezone FROM branches WHERE id = ? AND deleted_at IS NULL`,
    [branchId],
  );
  if (!branchRows[0]) throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
  const slots = await generateLabTestSlots(
    pool,
    branchId,
    branchTestId,
    date,
    Number(blt.duration_minutes),
    String(branchRows[0].timezone),
  );

  return json({ date, slots });
});

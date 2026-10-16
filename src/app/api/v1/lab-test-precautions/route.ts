import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { listActivePrecautions } from "@api/lib/lab-test-precautions";

// The active master list clinics pick from when adding or editing a lab test.
export const GET = api({ rateLimit: 120 }, async (ctx) => {
  requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  return json({ items: await listActivePrecautions(pool) });
});

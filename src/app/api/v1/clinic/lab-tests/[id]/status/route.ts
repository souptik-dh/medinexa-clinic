import { api, json, readJson } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { getLabTestInScope, auditLabAction, serializeLabTest } from "@api/lib/lab-tests";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

export const PATCH = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "sys_admin"]);
  const { id } = ctx.params;
  const body = parseBody(statusSchema, await readJson(ctx.request));

  await getLabTestInScope(pool, id, auth);

  await pool.query(`UPDATE lab_tests SET status = ? WHERE id = ?`, [body.status, id]);

  await auditLabAction(pool, auth.userId, "lab_test_status_changed", id, { status: body.status });

  const updated = await getLabTestInScope(pool, id, auth);
  return json(serializeLabTest(updated));
});

import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool, withTransaction } from "@api/lib/db";
import { newId } from "@api/lib/ids";
import { parseBody } from "@api/lib/validators";
import { serializeLabTest, getLabTestInScope, auditLabAction } from "@api/lib/lab-tests";
import { replaceTestPrecautions, withTestPrecautions } from "@api/lib/lab-test-precautions";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().min(1).max(100).optional(),
  instructions: z.string().max(2000).nullable().optional(),
  default_precautions: z.array(z.string().max(500)).optional(),
  // Replaces the test's selected precautions; [] clears them, omit to leave as is.
  precaution_ids: z.array(z.string().uuid()).max(100).optional(),
});

export const PUT = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "sys_admin"]);
  const { id } = ctx.params;
  const body = parseBody(updateSchema, await ctx.request.json());

  const existing = await getLabTestInScope(pool, id, auth);

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push("name = ?"); params.push(body.name); }
  if (body.code !== undefined) { updates.push("code = ?"); params.push(body.code); }
  if (body.description !== undefined) { updates.push("description = ?"); params.push(body.description); }
  if (body.category !== undefined) { updates.push("category = ?"); params.push(body.category); }
  if (body.instructions !== undefined) { updates.push("instructions = ?"); params.push(body.instructions); }
  if (body.default_precautions !== undefined) {
    updates.push("default_precautions = ?");
    params.push(JSON.stringify(body.default_precautions));
  }

  if (updates.length === 0 && body.precaution_ids === undefined) {
    const [unchanged] = await withTestPrecautions(pool, [serializeLabTest(existing)], "id");
    return json(unchanged);
  }

  await withTransaction(async (conn) => {
    if (updates.length > 0) {
      await conn.query(`UPDATE lab_tests SET ${updates.join(", ")} WHERE id = ?`, [...params, id]);
    }
    if (body.precaution_ids !== undefined) {
      await replaceTestPrecautions(conn, id, body.precaution_ids);
    }
  });

  await auditLabAction(pool, auth.userId, "lab_test_updated", id, body);

  const [row] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM lab_tests WHERE id = ?`, [id],
  );

  const [updated] = await withTestPrecautions(pool, [serializeLabTest(row[0])], "id");
  return json(updated);
});

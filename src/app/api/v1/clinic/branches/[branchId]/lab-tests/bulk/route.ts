import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool, withTransaction } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireBranchAccess } from "@api/lib/permissions";
import { auditLabAction, serializeBranchLabTest } from "@api/lib/lab-tests";
import { addTestsToBranch, labTestDuplicateError } from "@api/lib/lab-test-library";
import { withTestPrecautions } from "@api/lib/lab-test-precautions";
import { conflict, isUniqueViolation } from "@api/lib/errors";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";

const optionsSchema = {
  price: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default("INR"),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  clinic_available: z.boolean().default(true),
  home_collection_available: z.boolean().default(false),
  prescription_required: z.boolean().default(false),
};

const itemSchema = z.union([
  z.object({ library_test_id: z.string().uuid(), ...optionsSchema }).strict(),
  z
    .object({
      custom: z.object({
        name: z.string().trim().min(1).max(255),
        code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use letters, numbers, - . _ or /."),
        category: z.string().trim().min(1).max(100),
        description: z.string().trim().max(2000).nullable().optional(),
      }),
      ...optionsSchema,
    })
    .strict(),
]);

const bodySchema = z.object({
  items: z.array(itemSchema).min(1, "Select at least one test.").max(50),
});

// Adds several predefined and/or custom tests to one branch in a single transaction.
// The branch must have a valid lab schedule (re-checked here); nothing is saved if any
// item fails, and the error's `field` names the item (items.<i>[.code|.name]).
export const POST = api({ rateLimit: 60 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "sys_admin"]);
  const { branchId } = ctx.params;
  const body = parseBody(bodySchema, await ctx.request.json());

  await requireBranchAccess(pool, auth, branchId, "lab_tests:manage");

  const result = await withTransaction((conn) => addTestsToBranch(conn, branchId, body.items)).catch((err) => {
    // Another request added the same test, name or code between our checks and the insert.
    if (isUniqueViolation(err)) throw labTestDuplicateError(err) ?? conflict("DUPLICATE_TEST", "This test has already been added.");
    throw err;
  });

  await auditLabAction(pool, auth.userId, "branch_tests_bulk_added", branchId, {
    clinic_id: result.clinicId,
    added: result.added.map((a) => ({ test_id: a.test_id, source: a.source, reused_test: a.reused_test })),
  });

  const ids = result.added.map((a) => a.branch_lab_test_id);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT blt.*, lt.name AS test_name, lt.code AS test_code, lt.category AS test_category,
            lt.description AS test_description, lt.default_precautions
       FROM branch_lab_tests blt
       JOIN lab_tests lt ON lt.id = blt.test_id
      WHERE blt.id IN (?)
      ORDER BY lt.name ASC`,
    [ids],
  );

  return json({ items: await withTestPrecautions(pool, rows.map(serializeBranchLabTest), "test_id") }, 201);
});

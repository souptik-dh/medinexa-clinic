import { api, json, encodeCursor, decodeCursor } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { parseBody, parsePagination } from "@api/lib/validators";
import { conflict, isUniqueViolation } from "@api/lib/errors";
import { newId } from "@api/lib/ids";
import { auditLabAction } from "@api/lib/lab-tests";
import { assertBranchReadable, LIBRARY_CODE_PREFIX, serializeLibraryTest } from "@api/lib/lab-test-library";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";

// Searches the predefined library (name, internal code, abbreviation or category).
// With `branch_id`, each item also says whether it is already on that branch
// (`added_to_branch`) and which clinic test it was copied into (`clinic_test_id`).
export const GET = api({ rateLimit: 240 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const sp = ctx.request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() ?? "";
  const category = sp.get("category")?.trim() ?? "";
  const branchId = sp.get("branch_id");
  const { limit, cursor } = parsePagination(sp);
  const offset = Math.max(0, Number(decodeCursor(cursor)?.offset ?? 0) || 0);

  const conditions = ["l.status = 'active'"];
  const params: unknown[] = [];
  if (category) {
    conditions.push("l.category = ?");
    params.push(category);
  }
  // MySQL reads a bare integer in ORDER BY as a column position, so the rank is only
  // added when there is a search to rank by.
  let orderBy = "l.name ASC";
  const rankParams: unknown[] = [];
  if (search) {
    const like = `%${search}%`;
    conditions.push("(l.name LIKE ? OR l.internal_code LIKE ? OR l.abbreviations LIKE ? OR l.category LIKE ?)");
    params.push(like, like, like, like);
    // Name/code prefix matches first, then abbreviation hits, then the rest.
    orderBy = "CASE WHEN l.name LIKE ? OR l.internal_code LIKE ? THEN 0 WHEN l.abbreviations LIKE ? THEN 1 ELSE 2 END ASC, l.name ASC";
    rankParams.push(`${search}%`, `${search}%`, like);
  }

  let select = "l.*";
  const selectParams: unknown[] = [];
  if (branchId) {
    await assertBranchReadable(pool, auth, branchId);
    select += `,
      (SELECT lt.id FROM lab_tests lt JOIN branches b ON b.clinic_id = lt.clinic_id
        WHERE b.id = ? AND lt.library_test_id = l.id LIMIT 1) AS clinic_test_id,
      EXISTS(SELECT 1 FROM branch_lab_tests blt JOIN lab_tests lt ON lt.id = blt.test_id
        WHERE blt.branch_id = ? AND lt.library_test_id = l.id) AS added_to_branch`;
    selectParams.push(branchId, branchId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${select} FROM lab_test_library l
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [...selectParams, ...params, ...rankParams, limit + 1, offset],
  );
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM lab_test_library l WHERE ${conditions.join(" AND ")}`,
    params,
  );

  return json({
    items: items.map(serializeLibraryTest),
    next_cursor: hasMore ? encodeCursor({ offset: offset + limit }) : null,
    total: Number(countRows[0]?.total ?? 0),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(100),
  abbreviations: z.string().trim().max(255).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  reference_url: z.string().trim().url().max(500).nullable().optional(),
});

// Adding to the shared library is a platform-admin action (e.g. approving a clinic's
// custom test for everyone). Clinics' own custom tests stay in their lab_tests.
export const POST = api({ rateLimit: 60 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["sys_admin"]);
  const body = parseBody(createSchema, await ctx.request.json());

  const [last] = await pool.query<RowDataPacket[]>(
    `SELECT MAX(CAST(SUBSTRING(internal_code, ?) AS UNSIGNED)) AS n FROM lab_test_library WHERE internal_code LIKE ?`,
    [LIBRARY_CODE_PREFIX.length + 1, `${LIBRARY_CODE_PREFIX}%`],
  );
  const code = `${LIBRARY_CODE_PREFIX}${String(Number(last[0]?.n ?? 0) + 1).padStart(4, "0")}`;
  const id = newId();
  try {
    await pool.query(
      `INSERT INTO lab_test_library (id, internal_code, name, category, abbreviations, description, reference_url, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'active')`,
      [id, code, body.name, body.category, body.abbreviations ?? null, body.description ?? null, body.reference_url ?? null],
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("LIBRARY_TEST_EXISTS", "A predefined test with this name already exists.", "name");
    throw err;
  }
  await auditLabAction(pool, auth.userId, "lab_test_library_created", id, { code, name: body.name });

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM lab_test_library WHERE id = ?`, [id]);
  return json(serializeLibraryTest(rows[0]), 201);
});

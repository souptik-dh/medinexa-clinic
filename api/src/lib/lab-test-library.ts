import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { ApiError, badRequest, conflict, forbidden, notFound, unprocessable } from "@api/lib/errors";
import { newId } from "@api/lib/ids";
import type { AuthContext } from "@api/lib/auth";
import { getOwnedBranch } from "@api/lib/scope";

type Db = Pool | PoolConnection;
type Row = RowDataPacket;

// Predefined lab test library (lab_test_library) and the rules for adding tests to a
// branch. A library entry is only a template: adding it copies it into the clinic's own
// lab_tests (linked by library_test_id) and prices it for one branch in branch_lab_tests,
// so later library edits never rewrite a clinic's tests or its bookings.
//
// A test can only be added or assigned to a branch that has a valid lab schedule: the
// branch exists (not deleted) and has at least one active weekday in lab_test_schedules.
// Bookings are generated from that schedule, so a test without one could never be booked.

/** Codes generated for the library; custom clinic codes may not use this prefix. */
export const LIBRARY_CODE_PREFIX = "JLT-";

export const LAB_SCHEDULE_REQUIRED_MESSAGE = "Please create a lab schedule before adding lab tests.";

export function serializeLibraryTest(r: Row) {
  const base: Record<string, unknown> = {
    id: r.id,
    internal_code: r.internal_code,
    name: r.name,
    category: r.category,
    abbreviations: r.abbreviations ?? null,
    description: r.description ?? null,
    reference_url: r.reference_url ?? null,
    status: r.status,
  };
  // Only when the list was asked about a branch / clinic.
  if (r.clinic_test_id !== undefined) base.clinic_test_id = r.clinic_test_id ?? null;
  if (r.added_to_branch !== undefined) base.added_to_branch = Boolean(Number(r.added_to_branch));
  return base;
}

/** Read access to one branch's lab configuration: its owner, staff of that branch, or an admin. */
export async function assertBranchReadable(db: Db, auth: AuthContext, branchId: string): Promise<void> {
  if (auth.role === "sys_admin") return;
  if (auth.role === "clinic_owner") {
    await getOwnedBranch(db, branchId, auth.userId);
    return;
  }
  if (auth.role === "branch_staff" && auth.branchId === branchId) return;
  throw forbidden("BRANCH_ACCESS_DENIED", "You do not have access to this branch.");
}

export type ScheduleDay = { weekday: number; start_time: string; end_time: string };

/** Active lab schedule days per branch (every requested id present, possibly empty). */
export async function loadActiveScheduleDays(db: Db, branchIds: string[]): Promise<Map<string, ScheduleDay[]>> {
  const out = new Map<string, ScheduleDay[]>();
  const ids = [...new Set(branchIds.filter(Boolean))];
  for (const id of ids) out.set(id, []);
  if (ids.length === 0) return out;
  const [rows] = await db.query<Row[]>(
    `SELECT branch_id, weekday, start_time, end_time FROM lab_test_schedules
      WHERE branch_id IN (?) AND is_active = 1 AND start_time < end_time
      ORDER BY weekday ASC, start_time ASC`,
    [ids],
  );
  for (const r of rows) {
    out.get(r.branch_id)?.push({
      weekday: Number(r.weekday),
      start_time: String(r.start_time).slice(0, 5),
      end_time: String(r.end_time).slice(0, 5),
    });
  }
  return out;
}

/** Throws 422 LAB_SCHEDULE_REQUIRED unless the branch has at least one active schedule day. */
export async function assertBranchHasLabSchedule(db: Db, branchId: string): Promise<void> {
  const days = (await loadActiveScheduleDays(db, [branchId])).get(branchId) ?? [];
  if (days.length === 0) {
    throw unprocessable("LAB_SCHEDULE_REQUIRED", LAB_SCHEDULE_REQUIRED_MESSAGE, "branch_id");
  }
}

/** Clinic-level variant: at least one live branch of the clinic has an active schedule day. */
export async function assertClinicHasLabSchedule(db: Db, clinicId: string): Promise<void> {
  const [rows] = await db.query<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM lab_test_schedules s
       JOIN branches b ON b.id = s.branch_id
      WHERE b.clinic_id = ? AND b.deleted_at IS NULL AND s.is_active = 1 AND s.start_time < s.end_time`,
    [clinicId],
  );
  if (Number(rows[0]?.cnt ?? 0) === 0) {
    throw unprocessable("LAB_SCHEDULE_REQUIRED", LAB_SCHEDULE_REQUIRED_MESSAGE, "branch_id");
  }
}

/** 409 LAB_TEST_CODE_EXISTS when another test of the clinic already uses `code` (case-insensitive). */
export async function assertLabTestCodeFree(db: Db, clinicId: string, code: string, exceptTestId?: string): Promise<void> {
  const [rows] = await db.query<Row[]>(
    `SELECT id FROM lab_tests WHERE clinic_id = ? AND LOWER(code) = LOWER(?) AND id <> ? LIMIT 1`,
    [clinicId, code, exceptTestId ?? ""],
  );
  if (rows.length > 0) throw conflict("LAB_TEST_CODE_EXISTS", "A test with this code already exists.", "code");
}

/** 409 LAB_TEST_NAME_EXISTS when another test of the clinic has this name (case/space-insensitive). */
export async function assertLabTestNameFree(db: Db, clinicId: string, name: string, exceptTestId?: string): Promise<void> {
  const [rows] = await db.query<Row[]>(
    `SELECT id FROM lab_tests WHERE clinic_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
    [clinicId, name, exceptTestId ?? ""],
  );
  if (rows.length > 0) throw conflict("LAB_TEST_NAME_EXISTS", "A test with this name already exists.", "name");
}

/** For a derived name (quick-create from a category): `base`, or `base (2)`, `base (3)`… if taken. */
export async function uniqueLabTestName(db: Db, clinicId: string, base: string): Promise<string> {
  const [rows] = await db.query<Row[]>(`SELECT name FROM lab_tests WHERE clinic_id = ? AND name LIKE ?`, [clinicId, `${base}%`]);
  const taken = new Set(rows.map((r) => String(r.name).trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}

/**
 * Maps a duplicate-key error from inserting/updating lab_tests to the matching 409
 * (the request lost a race with another one), or returns null for any other error.
 */
export function labTestDuplicateError(err: unknown): ApiError | null {
  if ((err as { code?: string })?.code !== "ER_DUP_ENTRY") return null;
  const msg = String((err as { sqlMessage?: string; message?: string }).sqlMessage ?? (err as Error).message ?? "");
  if (msg.includes("uniq_lab_test_clinic_name")) return conflict("LAB_TEST_NAME_EXISTS", "A test with this name already exists.", "name");
  if (msg.includes("uniq_lab_test_clinic_code")) return conflict("LAB_TEST_CODE_EXISTS", "A test with this code already exists.", "code");
  // uniq_lab_test_clinic_library, uniq_branch_test: the same test twice.
  return conflict("DUPLICATE_TEST", "This test has already been added.");
}

export type BranchTestOptions = {
  price: number;
  currency: string;
  duration_minutes: number;
  clinic_available: boolean;
  home_collection_available: boolean;
  prescription_required: boolean;
};

export type AddTestItem = BranchTestOptions &
  (
    | { library_test_id: string; custom?: undefined }
    | { library_test_id?: undefined; custom: { name: string; code: string; category: string; description?: string | null } }
  );

export type AddedTest = { index: number; test_id: string; branch_lab_test_id: string; source: "library" | "custom"; reused_test: boolean };

const norm = (s: string) => s.trim().toLowerCase();
const itemError = (err: ApiError, index: number, sub?: string) => {
  err.field = `items.${index}${sub ? "." + sub : ""}`;
  return err;
};

/**
 * Adds predefined and/or custom tests to one branch, all or nothing. Must run inside a
 * transaction (`conn`); the branch row is locked so two concurrent requests can't both
 * pass the duplicate checks. Errors name the offending item in `field` (items.<i>[.code]).
 */
export async function addTestsToBranch(
  conn: PoolConnection,
  branchId: string,
  items: AddTestItem[],
): Promise<{ clinicId: string; added: AddedTest[] }> {
  const [branchRows] = await conn.query<Row[]>(
    `SELECT id, clinic_id FROM branches WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
    [branchId],
  );
  const branch = branchRows[0];
  if (!branch) throw notFound("BRANCH_NOT_FOUND", "Branch not found.");
  const clinicId: string = branch.clinic_id;

  // Re-checked here, not only in the UI: the schedule may have been switched off since.
  await assertBranchHasLabSchedule(conn, branchId);

  // Duplicates inside the request itself.
  const seenLibrary = new Set<string>();
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  items.forEach((item, i) => {
    if (item.custom === undefined) {
      if (seenLibrary.has(item.library_test_id)) {
        throw itemError(badRequest("DUPLICATE_IN_REQUEST", "This test has already been added."), i);
      }
      seenLibrary.add(item.library_test_id);
      return;
    }
    const code = norm(item.custom.code);
    const name = norm(item.custom.name);
    if (code.toUpperCase().startsWith(LIBRARY_CODE_PREFIX)) {
      throw itemError(
        badRequest("RESERVED_TEST_CODE", `Codes starting with ${LIBRARY_CODE_PREFIX} are reserved for predefined tests.`),
        i,
        "code",
      );
    }
    if (seenCodes.has(code)) throw itemError(conflict("LAB_TEST_CODE_EXISTS", "A test with this code already exists."), i, "code");
    if (seenNames.has(name)) throw itemError(conflict("LAB_TEST_NAME_EXISTS", "A test with this name already exists."), i, "name");
    seenCodes.add(code);
    seenNames.add(name);
  });

  const libraryIds = [...seenLibrary];
  const library = new Map<string, Row>();
  if (libraryIds.length > 0) {
    const [rows] = await conn.query<Row[]>(
      `SELECT id, internal_code, name, category, description FROM lab_test_library WHERE id IN (?) AND status = 'active'`,
      [libraryIds],
    );
    for (const r of rows) library.set(r.id, r);
  }

  const [clinicTests] = await conn.query<Row[]>(
    `SELECT id, library_test_id, code, name, status FROM lab_tests WHERE clinic_id = ? FOR UPDATE`,
    [clinicId],
  );
  const [assigned] = await conn.query<Row[]>(`SELECT test_id FROM branch_lab_tests WHERE branch_id = ?`, [branchId]);
  const assignedTestIds = new Set(assigned.map((r) => r.test_id as string));
  const byLibrary = new Map<string, Row>();
  const byCode = new Map<string, Row>();
  const byName = new Map<string, Row>();
  for (const t of clinicTests) {
    if (t.library_test_id) byLibrary.set(t.library_test_id, t);
    byCode.set(norm(t.code), t);
    byName.set(norm(t.name), t);
  }

  const added: AddedTest[] = [];
  for (const [i, item] of items.entries()) {
    let testId: string;
    let reused = false;

    if (item.custom === undefined) {
      const lib = library.get(item.library_test_id);
      if (!lib) throw itemError(notFound("LIBRARY_TEST_NOT_FOUND", "This predefined test is not available."), i);
      // Already in the clinic (added for another branch, or typed in by hand under the
      // same name before the library existed): reuse it instead of duplicating it.
      const sameName = byName.get(norm(lib.name));
      const existing = byLibrary.get(lib.id) ?? (sameName && !sameName.library_test_id ? sameName : undefined);
      if (existing) {
        testId = existing.id;
        reused = true;
        if (!existing.library_test_id) {
          await conn.query(`UPDATE lab_tests SET library_test_id = ? WHERE id = ?`, [lib.id, existing.id]);
          existing.library_test_id = lib.id;
          byLibrary.set(lib.id, existing);
        }
        if (existing.status !== "active") {
          await conn.query(`UPDATE lab_tests SET status = 'active' WHERE id = ?`, [existing.id]);
          existing.status = "active";
        }
      } else {
        if (byCode.has(norm(lib.internal_code))) {
          throw itemError(conflict("LAB_TEST_CODE_EXISTS", "A test with this code already exists."), i, "code");
        }
        testId = newId();
        await conn.query(
          `INSERT INTO lab_tests (id, clinic_id, library_test_id, name, code, description, category, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
          [testId, clinicId, lib.id, lib.name, lib.internal_code, lib.description ?? null, lib.category],
        );
        const row = { id: testId, library_test_id: lib.id, code: lib.internal_code, name: lib.name, status: "active" } as Row;
        byLibrary.set(lib.id, row);
        byCode.set(norm(lib.internal_code), row);
        byName.set(norm(lib.name), row);
      }
    } else {
      const c = item.custom;
      if (byCode.has(norm(c.code))) {
        throw itemError(conflict("LAB_TEST_CODE_EXISTS", "A test with this code already exists."), i, "code");
      }
      if (byName.has(norm(c.name))) {
        throw itemError(conflict("LAB_TEST_NAME_EXISTS", "A test with this name already exists."), i, "name");
      }
      testId = newId();
      await conn.query(
        `INSERT INTO lab_tests (id, clinic_id, library_test_id, name, code, description, category, status)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'active')`,
        [testId, clinicId, c.name.trim(), c.code.trim(), c.description?.trim() || null, c.category.trim()],
      );
      const row = { id: testId, library_test_id: null, code: c.code.trim(), name: c.name.trim(), status: "active" } as Row;
      byCode.set(norm(c.code), row);
      byName.set(norm(c.name), row);
    }

    if (assignedTestIds.has(testId)) {
      throw itemError(conflict("DUPLICATE_TEST", "This test has already been added."), i);
    }
    const branchLabTestId = newId();
    await conn.query(
      `INSERT INTO branch_lab_tests (id, clinic_id, branch_id, test_id, price, currency, duration_minutes,
                                     clinic_available, home_collection_available, prescription_required, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        branchLabTestId,
        clinicId,
        branchId,
        testId,
        item.price,
        item.currency,
        item.duration_minutes,
        item.clinic_available ? 1 : 0,
        item.home_collection_available ? 1 : 0,
        item.prescription_required ? 1 : 0,
      ],
    );
    assignedTestIds.add(testId);
    added.push({ index: i, test_id: testId, branch_lab_test_id: branchLabTestId, source: item.custom === undefined ? "library" : "custom", reused_test: reused });
  }

  return { clinicId, added };
}

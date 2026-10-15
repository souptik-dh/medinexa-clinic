import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import { ApiError } from "../../api/src/lib/errors";

// scope.ts pulls in the DB pool; these tests never touch it.
vi.mock("@api/lib/scope", () => ({ getOwnedBranch: vi.fn() }));
import {
  addTestsToBranch,
  assertBranchHasLabSchedule,
  LIBRARY_CODE_PREFIX,
  type AddTestItem,
} from "../../api/src/lib/lab-test-library";
import { planLibrarySeed, seedLabTestLibrary } from "../../api/scripts/lab-test-library-seed.mjs";

// ── In-memory stand-in for branches, schedules, library, lab_tests, branch_lab_tests ──
interface Branch { id: string; clinic_id: string; deleted_at: string | null }
interface Schedule { branch_id: string; weekday: number; start_time: string; end_time: string; is_active: number }
interface LibraryTest { id: string; internal_code: string; name: string; category: string; description: string | null; status: string }
interface LabTest { id: string; clinic_id: string; library_test_id: string | null; name: string; code: string; category: string; description: string | null; status: string }
interface BranchTest { id: string; branch_id: string; test_id: string; price: number }

function fakeDb(seed: { branches?: Branch[]; schedules?: Schedule[]; library?: LibraryTest[]; tests?: LabTest[]; branchTests?: BranchTest[] } = {}) {
  const db = {
    branches: seed.branches ?? [{ id: "b1", clinic_id: "c1", deleted_at: null }],
    schedules: seed.schedules ?? [{ branch_id: "b1", weekday: 1, start_time: "09:00:00", end_time: "13:00:00", is_active: 1 }],
    library: seed.library ?? [
      { id: "L1", internal_code: "JLT-0001", name: "Complete Blood Count (CBC)", category: "Hematology", description: null, status: "active" },
      { id: "L2", internal_code: "JLT-0002", name: "Lipid Panel", category: "Biochemistry", description: null, status: "active" },
      { id: "L3", internal_code: "JLT-0003", name: "Retired Test", category: "Biochemistry", description: null, status: "inactive" },
    ],
    tests: seed.tests ?? ([] as LabTest[]),
    branchTests: seed.branchTests ?? ([] as BranchTest[]),
  };
  const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
  const conn = {
    async query(sqlRaw: string, params: unknown[] = []) {
      const sql = norm(sqlRaw);
      if (sql.startsWith("SELECT id, clinic_id FROM branches WHERE id = ?")) {
        return [db.branches.filter((b) => b.id === params[0] && !b.deleted_at)];
      }
      if (sql.startsWith("SELECT branch_id, weekday, start_time, end_time FROM lab_test_schedules")) {
        const ids = params[0] as string[];
        return [db.schedules.filter((s) => ids.includes(s.branch_id) && s.is_active === 1 && s.start_time < s.end_time)];
      }
      if (sql.startsWith("SELECT id, internal_code, name, category, description FROM lab_test_library")) {
        const ids = params[0] as string[];
        return [db.library.filter((l) => ids.includes(l.id) && l.status === "active")];
      }
      if (sql.startsWith("SELECT id, library_test_id, code, name, status FROM lab_tests WHERE clinic_id = ?")) {
        return [db.tests.filter((t) => t.clinic_id === params[0]).map((t) => ({ ...t }))];
      }
      if (sql.startsWith("SELECT test_id FROM branch_lab_tests WHERE branch_id = ?")) {
        return [db.branchTests.filter((bt) => bt.branch_id === params[0])];
      }
      if (sql.startsWith("UPDATE lab_tests SET library_test_id = ?")) {
        db.tests.find((t) => t.id === params[1])!.library_test_id = params[0] as string;
        return [{}];
      }
      if (sql.startsWith("UPDATE lab_tests SET status = 'active'")) {
        db.tests.find((t) => t.id === params[0])!.status = "active";
        return [{}];
      }
      if (sql.startsWith("INSERT INTO lab_tests") && sql.includes("VALUES (?, ?, NULL,")) {
        const [id, clinic_id, name, code, description, category] = params as string[];
        db.tests.push({ id, clinic_id, library_test_id: null, name, code, description, category, status: "active" });
        return [{}];
      }
      if (sql.startsWith("INSERT INTO lab_tests")) {
        const [id, clinic_id, library_test_id, name, code, description, category] = params as string[];
        db.tests.push({ id, clinic_id, library_test_id, name, code, description, category, status: "active" });
        return [{}];
      }
      if (sql.startsWith("INSERT INTO branch_lab_tests")) {
        const [id, , branch_id, test_id, price] = params as [string, string, string, string, number];
        db.branchTests.push({ id, branch_id, test_id, price });
        return [{}];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return { db, conn: conn as unknown as PoolConnection };
}

const opts = { price: 250, currency: "INR", duration_minutes: 30, clinic_available: true, home_collection_available: false, prescription_required: false };
const lib = (id: string): AddTestItem => ({ library_test_id: id, ...opts });
const custom = (name: string, code: string, category = "Biochemistry"): AddTestItem => ({ custom: { name, code, category }, ...opts });

async function expectApiError(p: Promise<unknown>, status: number, code: string, field?: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  expect((err as ApiError).code).toBe(code);
  if (field !== undefined) expect((err as ApiError).field).toBe(field);
}

describe("lab schedule rule", () => {
  it("rejects a branch with no lab schedule", async () => {
    const { db, conn } = fakeDb({ schedules: [] });
    await expectApiError(addTestsToBranch(conn, "b1", [lib("L1")]), 422, "LAB_SCHEDULE_REQUIRED", "branch_id");
    expect(db.tests).toHaveLength(0);
    expect(db.branchTests).toHaveLength(0);
  });

  it("rejects a branch whose only schedule days are switched off", async () => {
    const { conn } = fakeDb({ schedules: [{ branch_id: "b1", weekday: 2, start_time: "09:00", end_time: "12:00", is_active: 0 }] });
    await expectApiError(addTestsToBranch(conn, "b1", [custom("Glucose", "GLU")]), 422, "LAB_SCHEDULE_REQUIRED");
  });

  it("ignores another branch's schedule", async () => {
    const { conn } = fakeDb({
      branches: [{ id: "b1", clinic_id: "c1", deleted_at: null }, { id: "b2", clinic_id: "c1", deleted_at: null }],
      schedules: [{ branch_id: "b2", weekday: 1, start_time: "09:00", end_time: "12:00", is_active: 1 }],
    });
    await expectApiError(assertBranchHasLabSchedule(conn, "b1"), 422, "LAB_SCHEDULE_REQUIRED");
    await expect(assertBranchHasLabSchedule(conn, "b2")).resolves.toBeUndefined();
  });

  it("rejects a deleted branch", async () => {
    const { conn } = fakeDb({ branches: [{ id: "b1", clinic_id: "c1", deleted_at: "2026-01-01" }] });
    await expectApiError(addTestsToBranch(conn, "b1", [lib("L1")]), 404, "BRANCH_NOT_FOUND");
  });
});

describe("addTestsToBranch", () => {
  it("adds several predefined and custom tests in one call, copying library details", async () => {
    const { db, conn } = fakeDb();
    const res = await addTestsToBranch(conn, "b1", [lib("L1"), lib("L2"), custom("Serum Zinc", "ZN-01", "Biochemistry")]);
    expect(res.clinicId).toBe("c1");
    expect(res.added).toHaveLength(3);
    expect(db.branchTests).toHaveLength(3);
    const cbc = db.tests.find((t) => t.library_test_id === "L1")!;
    expect(cbc).toMatchObject({ name: "Complete Blood Count (CBC)", code: "JLT-0001", category: "Hematology", clinic_id: "c1" });
    const zinc = db.tests.find((t) => t.code === "ZN-01")!;
    expect(zinc.library_test_id).toBeNull();
  });

  it("rejects the same predefined test twice in one request", async () => {
    const { db, conn } = fakeDb();
    await expectApiError(addTestsToBranch(conn, "b1", [lib("L1"), lib("L1")]), 400, "DUPLICATE_IN_REQUEST", "items.1");
    expect(db.tests).toHaveLength(0);
  });

  it("rejects a predefined test already on the branch", async () => {
    const { conn } = fakeDb({
      tests: [{ id: "t1", clinic_id: "c1", library_test_id: "L1", name: "Complete Blood Count (CBC)", code: "JLT-0001", category: "Hematology", description: null, status: "active" }],
      branchTests: [{ id: "bt1", branch_id: "b1", test_id: "t1", price: 100 }],
    });
    await expectApiError(addTestsToBranch(conn, "b1", [lib("L2"), lib("L1")]), 409, "DUPLICATE_TEST", "items.1");
  });

  it("reuses the clinic's copy when the test was already added for another branch", async () => {
    const { db, conn } = fakeDb({
      branches: [{ id: "b1", clinic_id: "c1", deleted_at: null }, { id: "b2", clinic_id: "c1", deleted_at: null }],
      tests: [{ id: "t1", clinic_id: "c1", library_test_id: "L1", name: "Complete Blood Count (CBC)", code: "JLT-0001", category: "Hematology", description: null, status: "active" }],
      branchTests: [{ id: "bt1", branch_id: "b2", test_id: "t1", price: 100 }],
    });
    const res = await addTestsToBranch(conn, "b1", [lib("L1")]);
    expect(res.added[0]).toMatchObject({ test_id: "t1", reused_test: true });
    expect(db.tests).toHaveLength(1);
  });

  it("links a hand-typed clinic test with the same name instead of duplicating it", async () => {
    const { db, conn } = fakeDb({
      tests: [{ id: "t9", clinic_id: "c1", library_test_id: null, name: "lipid panel", code: "LIPID", category: "Biochemistry", description: null, status: "inactive" }],
    });
    const res = await addTestsToBranch(conn, "b1", [lib("L2")]);
    expect(res.added[0]).toMatchObject({ test_id: "t9", reused_test: true });
    expect(db.tests[0]).toMatchObject({ library_test_id: "L2", status: "active", code: "LIPID" });
  });

  it("rejects a custom test whose code is already used in the clinic (case-insensitive)", async () => {
    const { conn } = fakeDb({
      tests: [{ id: "t1", clinic_id: "c1", library_test_id: null, name: "Glucose", code: "GLU", category: "Biochemistry", description: null, status: "active" }],
    });
    await expectApiError(addTestsToBranch(conn, "b1", [custom("Fasting Glucose", "glu")]), 409, "LAB_TEST_CODE_EXISTS", "items.0.code");
  });

  it("rejects a custom test whose name is already used in the clinic", async () => {
    const { conn } = fakeDb({
      tests: [{ id: "t1", clinic_id: "c1", library_test_id: null, name: "Glucose", code: "GLU", category: "Biochemistry", description: null, status: "active" }],
    });
    await expectApiError(addTestsToBranch(conn, "b1", [custom(" glucose ", "GLU-2")]), 409, "LAB_TEST_NAME_EXISTS", "items.0.name");
  });

  it("rejects two custom tests with the same code in one request", async () => {
    const { conn } = fakeDb();
    await expectApiError(addTestsToBranch(conn, "b1", [custom("A", "X1"), custom("B", "x1")]), 409, "LAB_TEST_CODE_EXISTS", "items.1.code");
  });

  it("reserves the library code prefix", async () => {
    const { conn } = fakeDb();
    await expectApiError(addTestsToBranch(conn, "b1", [custom("Mine", `${LIBRARY_CODE_PREFIX}9999`)]), 400, "RESERVED_TEST_CODE", "items.0.code");
  });

  it("rejects an unknown or inactive library test", async () => {
    const { conn } = fakeDb();
    await expectApiError(addTestsToBranch(conn, "b1", [lib("L3")]), 404, "LIBRARY_TEST_NOT_FOUND", "items.0");
    await expectApiError(addTestsToBranch(conn, "b1", [lib("nope")]), 404, "LIBRARY_TEST_NOT_FOUND", "items.0");
  });

  it("rejects a library test whose code clashes with an unrelated clinic test", async () => {
    const { conn } = fakeDb({
      tests: [{ id: "t1", clinic_id: "c1", library_test_id: null, name: "Something Else", code: "JLT-0002", category: "Other", description: null, status: "active" }],
    });
    await expectApiError(addTestsToBranch(conn, "b1", [lib("L2")]), 409, "LAB_TEST_CODE_EXISTS", "items.0.code");
  });
});

// ── Seed + dataset ─────────────────────────────────────────────────────────────────
const dataset = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "api", "src", "db", "lab-test-library.json"), "utf8"),
) as { categories: string[]; tests: { internal_code: string; name: string; category: string; source: string }[]; excluded: unknown[]; review: unknown[] };

describe("lab test library dataset", () => {
  it("has unique codes and names, valid categories and frozen-format codes", () => {
    const codes = dataset.tests.map((t) => t.internal_code);
    const names = dataset.tests.map((t) => t.name.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
    for (const t of dataset.tests) {
      expect(t.internal_code).toMatch(/^JLT-\d{4}$/);
      expect(dataset.categories).toContain(t.category);
    }
  });

  it("keeps non-laboratory entries out of the importable tests", () => {
    const names = new Set(dataset.tests.map((t) => t.name));
    for (const n of ["Ultrasound", "PET Scan", "Electrocardiogram", "Depression Screening", "How to Prepare for a Lab Test"]) {
      expect(names.has(n)).toBe(false);
    }
    expect(dataset.excluded.length).toBeGreaterThan(0);
    expect(dataset.review.length).toBeGreaterThan(0);
  });
});

describe("planLibrarySeed / seedLabTestLibrary", () => {
  it("inserts everything into an empty table and nothing on a re-run", () => {
    const first = planLibrarySeed(dataset, []);
    expect(first.insert).toHaveLength(dataset.tests.length);
    const second = planLibrarySeed(dataset, dataset.tests);
    expect(second.insert).toHaveLength(0);
    expect(second.skipped).toHaveLength(dataset.tests.length);
  });

  it("skips entries matched by name even if the code differs (manually added rows)", () => {
    const plan = planLibrarySeed(dataset, [{ internal_code: "JLT-9999", name: dataset.tests[0].name.toUpperCase() }]);
    expect(plan.skipped.map((t: { name: string }) => t.name)).toEqual([dataset.tests[0].name]);
  });

  it("reports duplicates inside the dataset instead of inserting them", () => {
    const data = { tests: [{ internal_code: "JLT-0001", name: "A" }, { internal_code: "jlt-0001", name: "B" }, { internal_code: "JLT-0003", name: "a" }] };
    const plan = planLibrarySeed(data, []);
    expect(plan.insert).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(2);
  });

  it("is idempotent against a database", async () => {
    const rows: { internal_code: string; name: string }[] = [];
    const conn = {
      async query(sql: string, params?: unknown[]) {
        if (sql.startsWith("SELECT internal_code, name FROM lab_test_library")) return [rows.map((r) => ({ ...r }))];
        if (sql.includes("INSERT IGNORE INTO lab_test_library")) {
          const values = (params![0] as unknown[][]);
          for (const v of values) rows.push({ internal_code: v[1] as string, name: v[2] as string });
          return [{ affectedRows: values.length }];
        }
        throw new Error("Unexpected SQL " + sql);
      },
    };
    const run1 = await seedLabTestLibrary(conn, dataset);
    const run2 = await seedLabTestLibrary(conn, dataset);
    expect(run1.inserted).toBe(dataset.tests.length);
    expect(run2.inserted).toBe(0);
    expect(rows).toHaveLength(dataset.tests.length);
    expect(run2.summary).toContain("0 imported");
  });
});

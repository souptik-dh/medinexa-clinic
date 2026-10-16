import { describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import {
  loadAppointmentPrecautions,
  replaceTestPrecautions,
  snapshotAppointmentPrecautions,
} from "../../api/src/lib/lab-test-precautions";

// ── In-memory stand-in for the three precaution tables ───────────────────────────
interface Precaution { id: string; name: string; description: string; category: string; sort_order: number; is_active: number }
interface Mapping { lab_test_id: string; precaution_id: string }
interface Snapshot { appointment_id: string; source_precaution_id: string | null; name: string; description: string; category: string | null; sort_order: number; created_at: number }

function fakeDb(precautions: Precaution[]) {
  const db = { precautions, mappings: [] as Mapping[], snapshots: [] as Snapshot[], clock: 0 };
  const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
  const conn = {
    async query(sqlRaw: string, params: unknown[] = []) {
      const sql = norm(sqlRaw);
      const byId = (id: string) => db.precautions.find((p) => p.id === id);

      if (sql.startsWith("SELECT p.id, p.is_active, EXISTS(")) {
        const [testId, ids] = params as [string, string[]];
        return [
          db.precautions
            .filter((p) => ids.includes(p.id))
            .map((p) => ({
              id: p.id,
              is_active: p.is_active,
              already_selected: db.mappings.some((m) => m.lab_test_id === testId && m.precaution_id === p.id) ? 1 : 0,
            })),
        ];
      }
      if (sql === "DELETE FROM lab_test_precaution_mappings WHERE lab_test_id = ?") {
        db.mappings = db.mappings.filter((m) => m.lab_test_id !== params[0]);
        return [{}];
      }
      if (sql.startsWith("DELETE FROM lab_test_precaution_mappings WHERE lab_test_id = ? AND precaution_id NOT IN (?)")) {
        const [testId, keep] = params as [string, string[]];
        db.mappings = db.mappings.filter((m) => m.lab_test_id !== testId || keep.includes(m.precaution_id));
        return [{}];
      }
      if (sql.startsWith("INSERT IGNORE INTO lab_test_precaution_mappings")) {
        for (const [, testId, pid] of (params[0] as string[][])) {
          if (!db.mappings.some((m) => m.lab_test_id === testId && m.precaution_id === pid)) {
            db.mappings.push({ lab_test_id: testId, precaution_id: pid });
          }
        }
        return [{}];
      }
      if (sql.startsWith("SELECT m.lab_test_id, p.id")) {
        const ids = params[0] as string[];
        const rows = db.mappings
          .filter((m) => ids.includes(m.lab_test_id))
          .map((m) => ({ m, p: byId(m.precaution_id)! }))
          .filter(({ p }) => p.is_active === 1)
          .sort((a, b) => a.p.sort_order - b.p.sort_order)
          .map(({ m, p }) => ({ lab_test_id: m.lab_test_id, id: p.id, name: p.name, description: p.description, category: p.category }));
        return [rows];
      }
      if (sql.startsWith("INSERT INTO lab_test_appointment_precautions")) {
        for (const [, appointmentId, sourceId, name, description, category, sort] of (params[0] as unknown[][])) {
          db.snapshots.push({
            appointment_id: appointmentId as string,
            source_precaution_id: sourceId as string,
            name: name as string,
            description: description as string,
            category: category as string,
            sort_order: sort as number,
            created_at: db.clock++,
          });
        }
        return [{}];
      }
      if (sql.startsWith("SELECT appointment_id, source_precaution_id")) {
        const ids = params[0] as string[];
        return [db.snapshots.filter((s) => ids.includes(s.appointment_id)).sort((a, b) => a.sort_order - b.sort_order)];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return { db, conn: conn as unknown as PoolConnection };
}

const P = (id: string, sort: number, is_active = 1): Precaution => ({
  id, name: `Name ${id}`, description: `Desc ${id}`, category: "General", sort_order: sort, is_active,
});

describe("replaceTestPrecautions", () => {
  it("saves, replaces and clears a test's selection without duplicates", async () => {
    const { db, conn } = fakeDb([P("a", 1), P("b", 2), P("c", 3)]);

    await replaceTestPrecautions(conn, "t1", ["a", "b", "a"]);
    expect(db.mappings.map((m) => m.precaution_id).sort()).toEqual(["a", "b"]);

    await replaceTestPrecautions(conn, "t1", ["b", "c"]);
    expect(db.mappings.map((m) => m.precaution_id).sort()).toEqual(["b", "c"]);

    await replaceTestPrecautions(conn, "t1", []);
    expect(db.mappings).toEqual([]);
  });

  it("rejects unknown ids", async () => {
    const { conn } = fakeDb([P("a", 1)]);
    await expect(replaceTestPrecautions(conn, "t1", ["a", "zzz"])).rejects.toMatchObject({ code: "PRECAUTION_NOT_FOUND" });
  });

  it("rejects newly selecting an inactive precaution but keeps one already selected", async () => {
    const { db, conn } = fakeDb([P("a", 1), P("b", 2)]);
    await replaceTestPrecautions(conn, "t1", ["a"]);
    db.precautions[0].is_active = 0;
    db.precautions[1].is_active = 0;

    await expect(replaceTestPrecautions(conn, "t1", ["a", "b"])).rejects.toMatchObject({ code: "PRECAUTION_INACTIVE" });
    await expect(replaceTestPrecautions(conn, "t1", ["a"])).resolves.toBeUndefined();
    expect(db.mappings.map((m) => m.precaution_id)).toEqual(["a"]);
  });
});

describe("booking snapshot", () => {
  it("copies the test's active precautions and is unaffected by later edits", async () => {
    const { db, conn } = fakeDb([P("a", 2), P("b", 1), P("c", 3, 0)]);
    db.mappings.push({ lab_test_id: "t1", precaution_id: "a" }, { lab_test_id: "t1", precaution_id: "b" }, { lab_test_id: "t1", precaution_id: "c" });

    await snapshotAppointmentPrecautions(conn, "appt1", "t1");
    await replaceTestPrecautions(conn, "t1", []);
    db.precautions[0].name = "Renamed";

    const saved = (await loadAppointmentPrecautions(conn, ["appt1", "appt2"]));
    expect(saved.get("appt1")!.map((p) => p.name)).toEqual(["Name b", "Name a"]);
    expect(saved.get("appt2")).toEqual([]);
  });

  it("writes nothing when the test has no precautions", async () => {
    const { db, conn } = fakeDb([P("a", 1)]);
    await snapshotAppointmentPrecautions(conn, "appt1", "t1");
    expect(db.snapshots).toEqual([]);
  });
});

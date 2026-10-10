import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { unprocessable } from "@api/lib/errors";
import { newId } from "@api/lib/ids";

type Db = Pool | PoolConnection;
type Row = RowDataPacket;

// Lab test precautions: a shared master list (lab_test_precautions), the ones a clinic
// selected per test (lab_test_precaution_mappings), and the copy taken onto each
// booking when it is made (lab_test_appointment_precautions). Bookings always read
// their own copy, so patient, clinic and staff views agree and later edits to the
// test never rewrite an existing booking.

export type LabTestPrecaution = {
  id: string;
  name: string;
  description: string;
  category: string | null;
};

// A booking's copy; `id` is the master precaution it came from (null if since deleted).
export type BookingPrecaution = Omit<LabTestPrecaution, "id"> & { id: string | null };

export function serializePrecaution(r: Row): LabTestPrecaution & { is_active?: boolean } {
  const base: LabTestPrecaution & { is_active?: boolean } = {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category ?? null,
  };
  if (r.is_active !== undefined) base.is_active = Boolean(r.is_active);
  return base;
}

export async function listActivePrecautions(db: Db): Promise<LabTestPrecaution[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT id, name, description, category FROM lab_test_precautions
      WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`,
  );
  return rows.map(serializePrecaution);
}

// Active precautions selected for each test, keyed by lab test id (every requested id
// is present, possibly with an empty list).
export async function loadTestPrecautions(
  db: Db,
  testIds: string[],
): Promise<Map<string, LabTestPrecaution[]>> {
  const out = new Map<string, LabTestPrecaution[]>();
  const ids = [...new Set(testIds.filter(Boolean))];
  for (const id of ids) out.set(id, []);
  if (ids.length === 0) return out;
  const [rows] = await db.query<Row[]>(
    `SELECT m.lab_test_id, p.id, p.name, p.description, p.category
       FROM lab_test_precaution_mappings m
       JOIN lab_test_precautions p ON p.id = m.precaution_id
      WHERE m.lab_test_id IN (?) AND p.is_active = 1
      ORDER BY p.sort_order ASC, p.name ASC`,
    [ids],
  );
  for (const r of rows) out.get(r.lab_test_id)?.push(serializePrecaution(r));
  return out;
}

// Replaces a test's selection. Unknown ids are rejected; an inactive precaution may
// stay selected only if it already was (it can't be newly added).
export async function replaceTestPrecautions(
  conn: PoolConnection,
  testId: string,
  precautionIds: string[],
): Promise<void> {
  const ids = [...new Set(precautionIds)];
  if (ids.length > 0) {
    const [rows] = await conn.query<Row[]>(
      `SELECT p.id, p.is_active,
              EXISTS(SELECT 1 FROM lab_test_precaution_mappings m
                      WHERE m.lab_test_id = ? AND m.precaution_id = p.id) AS already_selected
         FROM lab_test_precautions p WHERE p.id IN (?)`,
      [testId, ids],
    );
    const found = new Map(rows.map((r) => [r.id as string, r]));
    for (const id of ids) {
      const r = found.get(id);
      if (!r) {
        throw unprocessable("PRECAUTION_NOT_FOUND", "One or more selected precautions do not exist.", "precaution_ids");
      }
      if (!r.is_active && !Number(r.already_selected)) {
        throw unprocessable("PRECAUTION_INACTIVE", "An inactive precaution cannot be selected.", "precaution_ids");
      }
    }
  }

  if (ids.length === 0) {
    await conn.query(`DELETE FROM lab_test_precaution_mappings WHERE lab_test_id = ?`, [testId]);
    return;
  }
  await conn.query(
    `DELETE FROM lab_test_precaution_mappings WHERE lab_test_id = ? AND precaution_id NOT IN (?)`,
    [testId, ids],
  );
  await conn.query(
    `INSERT IGNORE INTO lab_test_precaution_mappings (id, lab_test_id, precaution_id) VALUES ?`,
    [ids.map((pid) => [newId(), testId, pid])],
  );
}

// Copies the test's current (active) precautions onto a new booking.
export async function snapshotAppointmentPrecautions(
  conn: PoolConnection,
  appointmentId: string,
  testId: string,
): Promise<void> {
  const precautions = (await loadTestPrecautions(conn, [testId])).get(testId) ?? [];
  if (precautions.length === 0) return;
  await conn.query(
    `INSERT INTO lab_test_appointment_precautions
       (id, appointment_id, source_precaution_id, name, description, category, sort_order)
     VALUES ?`,
    [precautions.map((p, i) => [newId(), appointmentId, p.id, p.name, p.description, p.category, i])],
  );
}

export async function loadAppointmentPrecautions(
  db: Db,
  appointmentIds: string[],
): Promise<Map<string, BookingPrecaution[]>> {
  const out = new Map<string, BookingPrecaution[]>();
  const ids = [...new Set(appointmentIds.filter(Boolean))];
  for (const id of ids) out.set(id, []);
  if (ids.length === 0) return out;
  const [rows] = await db.query<Row[]>(
    `SELECT appointment_id, source_precaution_id, name, description, category
       FROM lab_test_appointment_precautions
      WHERE appointment_id IN (?)
      ORDER BY sort_order ASC, created_at ASC`,
    [ids],
  );
  for (const r of rows) {
    out.get(r.appointment_id)?.push({
      id: r.source_precaution_id ?? null,
      name: r.name,
      description: r.description,
      category: r.category ?? null,
    });
  }
  return out;
}

// Adds `test_precautions` (the booking's own copy) to serialized lab appointments.
// Distinct from the existing `precautions` field: free-text notes the clinic may add
// when confirming.
export async function withAppointmentPrecautions<T extends Record<string, unknown>>(
  db: Db,
  items: T[],
): Promise<(T & { test_precautions: BookingPrecaution[] })[]> {
  const map = await loadAppointmentPrecautions(db, items.map((i) => String(i.id)));
  return items.map((i) => ({ ...i, test_precautions: map.get(String(i.id)) ?? [] }));
}

// Adds `precautions` (the test's current selection) to serialized lab tests or branch
// lab tests; `idKey` names the field holding the lab test id.
export async function withTestPrecautions<T extends Record<string, unknown>>(
  db: Db,
  items: T[],
  idKey: "id" | "test_id",
): Promise<(T & { precautions: LabTestPrecaution[] })[]> {
  const map = await loadTestPrecautions(db, items.map((i) => String(i[idKey])));
  return items.map((i) => ({ ...i, precautions: map.get(String(i[idKey])) ?? [] }));
}

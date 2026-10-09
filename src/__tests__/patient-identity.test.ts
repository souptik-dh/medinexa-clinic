import { describe, expect, it } from "vitest";
import { resolveServicePatient, sameName, type PatientDetailsInput } from "../../api/src/lib/patient-identity";
import type { AuthContext } from "../../api/src/lib/auth";

// ── A tiny in-memory stand-in for the users + patient_family_links tables ────────
interface User {
  id: string;
  name: string | null;
  phone: string | null;
  role: string;
  gender?: string | null;
}
interface Link {
  profile_user_id: string;
  patient_id: string;
  relationship: string;
  created_at: number;
}

function fakeDb(users: User[]) {
  const db = { users: [...users], links: [] as Link[], clock: 0 };
  const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
  const conn = {
    async query(sqlRaw: string, params: unknown[] = []) {
      const sql = norm(sqlRaw);
      const p = params as string[];
      const user = (id: string) => db.users.find((u) => u.id === id);

      if (sql.startsWith("SELECT id, name, phone, role FROM users WHERE id = ?")) {
        return [db.users.filter((u) => u.id === p[0])];
      }
      if (sql.startsWith("SELECT id, name, phone, role FROM users WHERE phone = ? AND role = 'patient'")) {
        return [db.users.filter((u) => u.phone === p[0] && u.role === "patient").slice(0, 1)];
      }
      if (sql.startsWith("INSERT INTO users") && sql.includes("VALUES (?, ?, NULL, ?")) {
        db.users.push({ id: p[0], name: p[1], phone: null, gender: p[2], role: "patient" });
        return [{}];
      }
      if (sql.startsWith("INSERT INTO users")) {
        if (db.users.some((u) => u.phone === p[2])) throw Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" });
        db.users.push({ id: p[0], name: p[1], phone: p[2], gender: p[3], role: "patient" });
        return [{}];
      }
      if (sql.startsWith("INSERT INTO patient_family_links")) {
        const existing = db.links.find((l) => l.profile_user_id === p[1] && l.patient_id === p[2]);
        if (existing) existing.relationship = p[3];
        else db.links.push({ profile_user_id: p[1], patient_id: p[2], relationship: p[3], created_at: db.clock++ });
        return [{}];
      }
      if (sql.startsWith("SELECT u.id, u.name FROM patient_family_links l JOIN users u ON u.id = l.patient_id WHERE l.profile_user_id = ?")) {
        return [db.links.filter((l) => l.profile_user_id === p[0]).map((l) => ({ id: l.patient_id, name: user(l.patient_id)?.name }))];
      }
      if (sql.startsWith("SELECT l.relationship, u.name, u.phone FROM patient_family_links l")) {
        return [
          db.links
            .filter((l) => l.profile_user_id === p[0] && l.patient_id === p[1])
            .map((l) => ({ relationship: l.relationship, name: user(l.patient_id)?.name, phone: user(l.patient_id)?.phone })),
        ];
      }
      if (sql.startsWith("SELECT relationship FROM patient_family_links WHERE profile_user_id = ? AND patient_id = ?")) {
        return [db.links.filter((l) => l.profile_user_id === p[0] && l.patient_id === p[1])];
      }
      if (sql.startsWith("SELECT u.id, u.name, u.phone, u.role FROM patient_family_links l JOIN users u ON u.id = l.profile_user_id")) {
        const link = db.links.filter((l) => l.patient_id === p[0]).sort((a, b) => a.created_at - b.created_at)[0];
        return [link ? [user(link.profile_user_id)] : []];
      }
      throw new Error(`fake db: unhandled SQL: ${sql}`);
    },
  };
  return { db, conn: conn as never };
}

const SOUPTIK: User = { id: "u-souptik", name: "Souptik Dhar", phone: "+919800000001", role: "patient" };
const STAFF: User = { id: "u-staff", name: "Reception", phone: "+919800000099", role: "branch_staff" };
const app = { userId: SOUPTIK.id, role: "patient" } as AuthContext;
const reception = { userId: STAFF.id, role: "branch_staff" } as AuthContext;
const details = (d: Partial<PatientDetailsInput>): PatientDetailsInput => ({ relationship: "self", name: "", ...d });

describe("sameName", () => {
  it("ignores case and extra spaces", () => {
    expect(sameName(" riya   DHAR ", "Riya Dhar")).toBe(true);
    expect(sameName("Riya", "Riya Dhar")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });
});

describe("Patient App bookings", () => {
  it("self booking: profile and patient are the account, typed name ignored", async () => {
    const { conn } = fakeDb([SOUPTIK]);
    const r = await resolveServicePatient(conn, app, details({ name: "Someone Else" }));
    expect(r).toMatchObject({
      patientId: SOUPTIK.id,
      profileUserId: SOUPTIK.id,
      profileName: "Souptik Dhar",
      relationship: "self",
      name: "Souptik Dhar",
      bookingSource: "PATIENT_APP",
    });
  });

  it("family member with the profile's own phone gets a separate record, not the parent's", async () => {
    const { conn, db } = fakeDb([SOUPTIK]);
    const r = await resolveServicePatient(
      conn,
      app,
      details({ relationship: "child", name: "Arjun Dhar", phone: SOUPTIK.phone, age: 8, gender: "male" }),
    );
    expect(r.patientId).not.toBe(SOUPTIK.id);
    expect(r.profileUserId).toBe(SOUPTIK.id);
    expect(r.relationship).toBe("child");
    expect(db.users.find((u) => u.id === r.patientId)).toMatchObject({ name: "Arjun Dhar", phone: null });
    expect(db.links).toHaveLength(1);
  });

  it("booking the same family member again reuses the record (no duplicate)", async () => {
    const { conn, db } = fakeDb([SOUPTIK]);
    const a = await resolveServicePatient(conn, app, details({ relationship: "parent", name: "Anjana Dhar" }));
    const b = await resolveServicePatient(conn, app, details({ relationship: "parent", name: "anjana  dhar" }));
    expect(b.patientId).toBe(a.patientId);
    expect(db.users).toHaveLength(2);
  });

  it("two children sharing the parent's phone stay two people", async () => {
    const { conn } = fakeDb([SOUPTIK]);
    const a = await resolveServicePatient(conn, app, details({ relationship: "child", name: "Arjun Dhar", phone: SOUPTIK.phone }));
    const b = await resolveServicePatient(conn, app, details({ relationship: "child", name: "Riya Dhar", phone: SOUPTIK.phone }));
    expect(a.patientId).not.toBe(b.patientId);
  });

  it("picking a linked family member by id uses that record", async () => {
    const { conn } = fakeDb([SOUPTIK]);
    const first = await resolveServicePatient(conn, app, details({ relationship: "child", name: "Riya Dhar" }));
    const again = await resolveServicePatient(conn, app, details({ patient_id: first.patientId!, name: "ignored" }));
    expect(again).toMatchObject({ patientId: first.patientId, relationship: "child", name: "Riya Dhar" });
  });

  it("an app user cannot pick an unlinked patient by id", async () => {
    const other: User = { id: "u-other", name: "Stranger", phone: "+919800000002", role: "patient" };
    const { conn } = fakeDb([SOUPTIK, other]);
    await expect(resolveServicePatient(conn, app, details({ patient_id: other.id, name: "x" }))).rejects.toMatchObject({
      code: "PATIENT_NOT_FOUND",
    });
  });
});

describe("Reception bookings", () => {
  it("new walk-in, profile name = patient name: one record, SELF", async () => {
    const { conn, db } = fakeDb([STAFF]);
    const r = await resolveServicePatient(
      conn,
      reception,
      details({ profile_name: "Souptik Dhar", name: "Souptik Dhar", phone: "+919811111111" }),
    );
    expect(r.relationship).toBe("self");
    expect(r.patientId).toBe(r.profileUserId);
    expect(r.bookingSource).toBe("RECEPTION");
    expect(r.bookedBy).toBe(STAFF.id);
    expect(db.users.filter((u) => u.role === "patient")).toHaveLength(1);
  });

  it("new walk-in booked by a relative: profile account + separate patient + link", async () => {
    const { conn, db } = fakeDb([STAFF]);
    const r = await resolveServicePatient(
      conn,
      reception,
      details({ profile_name: "Souptik Dhar", name: "Riya Dhar", relationship: "child", phone: "+919811111111", gender: "female" }),
    );
    expect(r.profileName).toBe("Souptik Dhar");
    expect(r.patientId).not.toBe(r.profileUserId);
    expect(r.relationship).toBe("child");
    expect(db.users.find((u) => u.id === r.patientId)).toMatchObject({ name: "Riya Dhar", phone: null });
    expect(db.links).toEqual([expect.objectContaining({ profile_user_id: r.profileUserId, patient_id: r.patientId })]);
  });

  it("different names with relationship left at SELF are rejected", async () => {
    const { conn } = fakeDb([STAFF]);
    await expect(
      resolveServicePatient(conn, reception, details({ profile_name: "Souptik Dhar", name: "Riya Dhar", phone: "+919811111111" })),
    ).rejects.toMatchObject({ code: "RELATIONSHIP_REQUIRED" });
  });

  it("existing phone owner becomes the profile; a different patient name is their family member", async () => {
    const { conn } = fakeDb([STAFF, SOUPTIK]);
    const r = await resolveServicePatient(
      conn,
      reception,
      details({ profile_name: "Souptik Dhar", name: "Anjana Dhar", relationship: "parent", phone: SOUPTIK.phone }),
    );
    expect(r.profileUserId).toBe(SOUPTIK.id);
    expect(r.patientId).not.toBe(SOUPTIK.id);
  });

  it("selected existing patient: no new record; profile defaults to the patient's own account", async () => {
    const { conn, db } = fakeDb([STAFF, SOUPTIK]);
    const r = await resolveServicePatient(conn, reception, details({ patient_id: SOUPTIK.id, name: "typed" }));
    expect(r).toMatchObject({ patientId: SOUPTIK.id, profileUserId: SOUPTIK.id, relationship: "self", name: "Souptik Dhar" });
    expect(db.users).toHaveLength(2);
  });

  it("existing patient + different profile account: patient unchanged, link stored", async () => {
    const riya: User = { id: "u-riya", name: "Riya Dhar", phone: "+919800000003", role: "patient" };
    const { conn, db } = fakeDb([STAFF, SOUPTIK, riya]);
    const r = await resolveServicePatient(
      conn,
      reception,
      details({ patient_id: riya.id, profile_user_id: SOUPTIK.id, relationship: "child", name: "Riya Dhar" }),
    );
    expect(r).toMatchObject({ patientId: riya.id, profileUserId: SOUPTIK.id, relationship: "child" });
    expect(db.users).toHaveLength(3);
    expect(db.links).toHaveLength(1);
  });

  it("a dependent with no phone picked at reception gets their guardian as profile", async () => {
    const { conn } = fakeDb([STAFF, SOUPTIK]);
    const child = await resolveServicePatient(conn, app, details({ relationship: "child", name: "Arjun Dhar" }));
    const r = await resolveServicePatient(conn, reception, details({ patient_id: child.patientId!, name: "Arjun Dhar" }));
    expect(r).toMatchObject({ profileUserId: SOUPTIK.id, relationship: "child" });
  });

  it("older clients (no profile name) booking a relative on an existing phone record 'other'", async () => {
    const { conn } = fakeDb([STAFF, SOUPTIK]);
    const r = await resolveServicePatient(conn, reception, details({ name: "Anjana Dhar", phone: SOUPTIK.phone }));
    expect(r).toMatchObject({ profileUserId: SOUPTIK.id, relationship: "other" });
    expect(r.patientId).not.toBe(SOUPTIK.id);
  });

  it("a phone held by a staff account cannot become a patient's", async () => {
    const { conn } = fakeDb([STAFF]);
    await expect(
      resolveServicePatient(conn, reception, details({ name: "Someone", phone: STAFF.phone })),
    ).rejects.toMatchObject({ code: "PHONE_ALREADY_REGISTERED" });
  });
});

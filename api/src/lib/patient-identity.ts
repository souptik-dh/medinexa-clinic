import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { newId } from "@api/lib/ids";
import { conflict, isUniqueViolation, notFound, unprocessable } from "@api/lib/errors";
import type { AuthContext } from "@api/lib/auth";

type Row = RowDataPacket;
type Conn = Pick<PoolConnection, "query">;

export type BookingSource = "PATIENT_APP" | "RECEPTION";
export type Relationship = "self" | "spouse" | "child" | "parent" | "sibling" | "friend" | "other";
type FamilyRelationship = Exclude<Relationship, "self">;

export interface PatientDetailsInput {
  /** An existing patient to book for (reception: any patient; app: self or a linked family member). */
  patient_id?: string;
  /** Reception only: the Patient App account (profile) the booking belongs to. */
  profile_user_id?: string;
  /** Reception only: name of the profile account, used when it has to be created. */
  profile_name?: string | null;
  relationship: Relationship;
  name: string;
  /** Contact phone. For a reception booking it is the profile account's phone. */
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
}

/**
 * Who a booking belongs to and who it is for, kept apart:
 * - profile: the Patient App account that owns the booking (the app user, or for a
 *   reception booking the account registered to the entered phone);
 * - patient: the person receiving the service.
 * `name`, `phone` and `relationship` are the values to snapshot on the booking row.
 */
export interface ResolvedServicePatient {
  patientId: string | null;
  profileUserId: string | null;
  profileName: string | null;
  bookingSource: BookingSource;
  bookedBy: string;
  relationship: Relationship;
  name: string;
  phone: string | null;
}

interface UserRow {
  id: string;
  name: string | null;
  phone: string | null;
  role: string;
}

/** Case- and space-insensitive person-name comparison ("riya  dhar" = "Riya Dhar"). */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}

async function getUser(conn: Conn, id: string): Promise<UserRow | null> {
  const [rows] = await conn.query<Row[]>(`SELECT id, name, phone, role FROM users WHERE id = ?`, [id]);
  return (rows[0] as UserRow | undefined) ?? null;
}

async function findPatientByPhone(conn: Conn, phone: string): Promise<UserRow | null> {
  const [rows] = await conn.query<Row[]>(
    `SELECT id, name, phone, role FROM users WHERE phone = ? AND role = 'patient' LIMIT 1`,
    [phone],
  );
  return (rows[0] as UserRow | undefined) ?? null;
}

/**
 * The patient account registered to `phone`, created when none exists yet (no
 * password: an unregistered walk-in, same convention as before). A phone held by a
 * staff, doctor or owner account can't become a patient's: 409 PHONE_ALREADY_REGISTERED.
 */
async function findOrCreateAccountByPhone(
  conn: Conn,
  phone: string,
  name: string,
  gender: string | null | undefined,
): Promise<UserRow> {
  const existing = await findPatientByPhone(conn, phone);
  if (existing) return existing;
  const id = newId();
  try {
    await conn.query(
      `INSERT INTO users (id, name, phone, gender, role, status) VALUES (?, ?, ?, ?, 'patient', 'active')`,
      [id, name, phone, gender ?? null],
    );
    return { id, name, phone, role: "patient" };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const retry = await findPatientByPhone(conn, phone);
    if (retry) return retry;
    throw conflict(
      "PHONE_ALREADY_REGISTERED",
      "This phone number is already registered under a different account.",
    );
  }
}

async function linkFamilyMember(
  conn: Conn,
  profileUserId: string,
  patientId: string,
  relationship: FamilyRelationship,
): Promise<void> {
  if (profileUserId === patientId) return;
  await conn.query(
    `INSERT INTO patient_family_links (id, profile_user_id, patient_id, relationship)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE relationship = VALUES(relationship)`,
    [newId(), profileUserId, patientId, relationship],
  );
}

async function findLinkedMemberByName(conn: Conn, profileUserId: string, name: string): Promise<string | null> {
  const [rows] = await conn.query<Row[]>(
    `SELECT u.id, u.name FROM patient_family_links l JOIN users u ON u.id = l.patient_id
      WHERE l.profile_user_id = ?`,
    [profileUserId],
  );
  const hit = rows.find((r) => sameName(r.name, name));
  return hit ? String(hit.id) : null;
}

/**
 * The family member `name` of `profile`, without merging different people:
 * 1. a member already linked to this profile with the same name;
 * 2. the patient account of a phone that is NOT the profile's own, when the name matches
 *    (or a new account for that phone when nobody holds it yet);
 * 3. otherwise a new patient record with no phone of its own — relatives commonly share
 *    the profile's number, and phones are unique across all accounts.
 */
async function findOrCreateFamilyMember(
  conn: Conn,
  profile: UserRow,
  details: { name: string; phone?: string | null; gender?: string | null },
): Promise<string> {
  const linked = await findLinkedMemberByName(conn, profile.id, details.name);
  if (linked) return linked;

  if (details.phone && details.phone !== profile.phone) {
    const owner = await findPatientByPhone(conn, details.phone);
    if (owner && sameName(owner.name, details.name)) return owner.id;
    if (!owner) {
      const created = await findOrCreateAccountByPhone(conn, details.phone, details.name, details.gender);
      if (sameName(created.name, details.name)) return created.id;
    }
  }

  const id = newId();
  await conn.query(
    `INSERT INTO users (id, name, phone, gender, role, status) VALUES (?, ?, NULL, ?, 'patient', 'active')`,
    [id, details.name, details.gender ?? null],
  );
  return id;
}

/** The relationship to store for a non-self booking; a stray 'self' becomes 'other'. */
function familyRelationship(rel: Relationship): FamilyRelationship {
  return rel === "self" ? "other" : rel;
}

/**
 * Resolves who a new booking belongs to (profile) and who it is for (patient).
 * `appointments.patient_id` / `lab_test_appointments.patient_id` keep meaning the
 * booking account (auth.userId) — this resolves the *_patients row only.
 */
export async function resolveServicePatient(
  conn: Conn,
  auth: AuthContext,
  details: PatientDetailsInput,
): Promise<ResolvedServicePatient> {
  return auth.role === "patient"
    ? resolveForApp(conn, auth.userId, details)
    : resolveForReception(conn, details, auth.userId);
}

// ── Patient App: the logged-in account is always the profile ──────────────────
async function resolveForApp(conn: Conn, userId: string, details: PatientDetailsInput): Promise<ResolvedServicePatient> {
  const profile = await getUser(conn, userId);
  if (!profile) throw notFound("PATIENT_NOT_FOUND", "Account not found.");
  const base = {
    profileUserId: profile.id,
    profileName: profile.name,
    bookingSource: "PATIENT_APP" as const,
    bookedBy: userId,
  };

  const selfBooking = (): ResolvedServicePatient => ({
    ...base,
    patientId: profile.id,
    relationship: "self",
    // "Myself" is always the account holder: a different typed name is never stored against it.
    name: profile.name || details.name,
    phone: details.phone || profile.phone,
  });

  if (details.patient_id === profile.id || (!details.patient_id && details.relationship === "self")) {
    return selfBooking();
  }

  if (details.patient_id) {
    // Only people already linked to this account can be picked by id.
    const [links] = await conn.query<Row[]>(
      `SELECT l.relationship, u.name, u.phone FROM patient_family_links l JOIN users u ON u.id = l.patient_id
        WHERE l.profile_user_id = ? AND l.patient_id = ?`,
      [profile.id, details.patient_id],
    );
    if (!links[0]) throw notFound("PATIENT_NOT_FOUND", "Selected family member was not found.");
    const relationship =
      details.relationship === "self" ? (links[0].relationship as FamilyRelationship) : details.relationship;
    await linkFamilyMember(conn, profile.id, details.patient_id, relationship);
    return {
      ...base,
      patientId: details.patient_id,
      relationship,
      name: links[0].name || details.name,
      phone: details.phone || links[0].phone || profile.phone,
    };
  }

  const relationship = familyRelationship(details.relationship);
  const patientId = await findOrCreateFamilyMember(conn, profile, details);
  if (patientId === profile.id) return selfBooking();
  await linkFamilyMember(conn, profile.id, patientId, relationship);
  return { ...base, patientId, relationship, name: details.name, phone: details.phone || profile.phone };
}

// ── Reception: profile and patient are both resolved from what staff entered ──
async function resolveForReception(
  conn: Conn,
  details: PatientDetailsInput,
  bookedBy: string,
): Promise<ResolvedServicePatient> {
  const base = { bookingSource: "RECEPTION" as const, bookedBy };

  let profile: UserRow | null = null;
  if (details.profile_user_id) {
    profile = await getUser(conn, details.profile_user_id);
    if (!profile || profile.role !== "patient") {
      throw notFound("PROFILE_NOT_FOUND", "Selected patient app profile was not found.");
    }
  }

  // 1. An existing patient was picked: no record is created or changed.
  if (details.patient_id) {
    const patient = await getUser(conn, details.patient_id);
    if (!patient || patient.role !== "patient") {
      throw notFound("PATIENT_NOT_FOUND", "Selected patient was not found.");
    }
    if (!profile) profile = await defaultProfileFor(conn, patient);
    let relationship: Relationship = "self";
    if (profile.id !== patient.id) {
      const [link] = await conn.query<Row[]>(
        `SELECT relationship FROM patient_family_links WHERE profile_user_id = ? AND patient_id = ?`,
        [profile.id, patient.id],
      );
      relationship =
        details.relationship !== "self"
          ? details.relationship
          : ((link[0]?.relationship as FamilyRelationship | undefined) ?? "other");
      await linkFamilyMember(conn, profile.id, patient.id, relationship as FamilyRelationship);
    }
    return {
      ...base,
      patientId: patient.id,
      profileUserId: profile.id,
      profileName: profile.name,
      relationship,
      name: patient.name || details.name,
      phone: details.phone || patient.phone || profile.phone,
    };
  }

  // 2. A new patient. The profile is the picked account, else the account registered
  //    to the entered phone, else a new account named after the profile.
  const profileName = details.profile_name?.trim() || null;
  if (!profile) {
    if (!details.phone) {
      throw unprocessable("VALIDATION_ERROR", "phone is required for a new patient.", "phone");
    }
    profile = await findOrCreateAccountByPhone(conn, details.phone, profileName || details.name, details.gender);
  }

  // Same person as the profile → SELF: the account's own name matches, or the typed
  // profile name matches and staff left the relationship at self.
  const isSelf =
    sameName(profile.name, details.name) ||
    (!!profileName && sameName(profileName, details.name) && details.relationship === "self");
  if (isSelf) {
    return {
      ...base,
      patientId: profile.id,
      profileUserId: profile.id,
      profileName: profile.name,
      relationship: "self",
      name: details.name,
      phone: details.phone || profile.phone,
    };
  }
  // A typed profile name that differs from the patient's needs a real relationship.
  // Without one (older clients send no profile name) a relative of the phone's owner
  // is recorded as "other".
  if (details.relationship === "self" && profileName) {
    throw unprocessable(
      "RELATIONSHIP_REQUIRED",
      "Choose how the patient is related to the profile when their names differ.",
      "relationship",
    );
  }
  const relationship = familyRelationship(details.relationship);
  const patientId = await findOrCreateFamilyMember(conn, profile, {
    name: details.name,
    gender: details.gender,
    // The entered phone belongs to the profile; it is never given to the family member.
    phone: null,
  });
  await linkFamilyMember(conn, profile.id, patientId, relationship);
  return {
    ...base,
    patientId,
    profileUserId: profile.id,
    profileName: profile.name,
    relationship,
    name: details.name,
    phone: details.phone || profile.phone,
  };
}

/**
 * Profile for an existing patient picked at reception with no profile chosen: the
 * patient's own account when it has a phone (they can use the app), else the account
 * that first linked them as family, else the patient themselves.
 */
async function defaultProfileFor(conn: Conn, patient: UserRow): Promise<UserRow> {
  if (patient.phone) return patient;
  const [rows] = await conn.query<Row[]>(
    `SELECT u.id, u.name, u.phone, u.role FROM patient_family_links l JOIN users u ON u.id = l.profile_user_id
      WHERE l.patient_id = ? ORDER BY l.created_at LIMIT 1`,
    [patient.id],
  );
  return (rows[0] as UserRow | undefined) ?? patient;
}

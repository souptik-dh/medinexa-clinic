import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { newId } from "@api/lib/ids";
import { sendFcmToUsersLocalized, type FcmMessage, type PushLanguage } from "@api/lib/fcm";
import { patientEmailHtml, sendEmail } from "@api/lib/notifications";
import { computeLiveState, ensureClinicSubscription, getPlatformSettings } from "@api/lib/subscriptions";
import { doctorNameSql } from "@api/lib/doctor-name";

type Row = RowDataPacket;

/**
 * "New clinic near you" announcements.
 *
 * A sweep (every 15 minutes, started from instrumentation.ts, or on demand via
 * POST /super-admin/system/announce-new-clinics) looks for clinics that are:
 *   - new: created within ANNOUNCE_WINDOW_DAYS and never announced,
 *   - activated: trial/subscription not blocked (the same gate every clinic
 *     operation uses) and trade licence not rejected,
 *   - bookable: at least one live branch with an active doctor or lab test.
 * Each eligible clinic is claimed (clinic_announcements row) and its matching
 * patients get an in-app notification, a push in their app's language and, when
 * they have an email on file, an email. clinic_announcement_recipients' primary key
 * makes duplicate notifications for the same clinic and patient impossible.
 *
 * Registration and booking flows are untouched: nothing here runs inside them.
 */

export const ANNOUNCE_WINDOW_DAYS = 60;
const MAX_DOCTORS_LISTED = 5;
const INSERT_CHUNK = 500;

export type MatchReason = "pin_code" | "village" | "district" | "nearby_location";

interface ClinicArea {
  pins: Set<string>;
  districts: Set<string>;
  /** "post office|district" pairs; district may be "" when unknown. */
  villages: Set<string>;
  villageNames: Set<string>;
  nearby: Set<string>;
}

export interface ClinicSummary {
  clinicId: string;
  clinicName: string;
  branchId: string;
  address: string;
  area: string;
  doctors: { name: string; specialization: string | null }[];
  doctorCount: number;
  specializations: string[];
  labTestCount: number;
}

const norm = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : "");
const pinNorm = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, "") : "");

// ---------------------------------------------------------------------------
// Clinic details
// ---------------------------------------------------------------------------

async function loadClinicSummary(db: Pool, clinicId: string): Promise<{ summary: ClinicSummary; area: ClinicArea } | null> {
  const [clinicRows] = await db.query<Row[]>(`SELECT * FROM clinics WHERE id = ? AND deleted_at IS NULL`, [clinicId]);
  const clinic = clinicRows[0];
  if (!clinic) return null;

  const [branches] = await db.query<Row[]>(
    `SELECT * FROM branches WHERE clinic_id = ? AND deleted_at IS NULL ORDER BY is_main DESC, created_at ASC`,
    [clinicId],
  );
  if (branches.length === 0) return null;

  const [doctorRows] = await db.query<Row[]>(
    `SELECT DISTINCT d.id, ${doctorNameSql()} AS name, d.specialization
       FROM doctor_branch_assignments dba
       JOIN branches b ON b.id = dba.branch_id AND b.deleted_at IS NULL
       JOIN doctors d ON d.id = dba.doctor_id
      WHERE b.clinic_id = ? AND dba.is_active = 1
      ORDER BY name`,
    [clinicId],
  );
  const [testRows] = await db.query<Row[]>(
    `SELECT COUNT(DISTINCT blt.test_id) AS cnt
       FROM branch_lab_tests blt
       JOIN branches b ON b.id = blt.branch_id AND b.deleted_at IS NULL
      WHERE blt.clinic_id = ? AND blt.status = 'active'`,
    [clinicId],
  );

  const area: ClinicArea = { pins: new Set(), districts: new Set(), villages: new Set(), villageNames: new Set(), nearby: new Set() };
  for (const place of [clinic, ...branches]) {
    const pin = pinNorm(place.pin_code);
    if (pin) area.pins.add(pin);
    const district = norm(place.district);
    if (district) area.districts.add(district);
    const village = norm(place.post_office);
    if (village) {
      area.villages.add(`${village}|${district}`);
      area.villageNames.add(village);
    }
    const nearby = norm(place.nearby_location);
    if (nearby) area.nearby.add(nearby);
  }

  const main = branches[0];
  const areaLabel = [main.post_office ?? main.city, main.district, main.pin_code]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(", ");
  const specializations = Array.from(
    new Set(doctorRows.map((d) => (typeof d.specialization === "string" ? d.specialization.trim() : "")).filter(Boolean)),
  );

  return {
    area,
    summary: {
      clinicId,
      clinicName: String(clinic.name),
      branchId: String(main.id),
      address: [main.address, areaLabel].filter((v) => typeof v === "string" && v.trim()).join(", "),
      area: areaLabel,
      doctors: doctorRows.slice(0, MAX_DOCTORS_LISTED).map((d) => ({
        name: String(d.name),
        specialization: typeof d.specialization === "string" && d.specialization.trim() ? d.specialization.trim() : null,
      })),
      doctorCount: doctorRows.length,
      specializations,
      labTestCount: Number(testRows[0]?.cnt ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Patient matching
// ---------------------------------------------------------------------------

interface MatchedPatient {
  userId: string;
  email: string | null;
  reason: MatchReason;
}

/**
 * Active patient accounts (the phone-holding account, not phone-less family
 * profiles, which are reached through it) whose registered area matches the clinic:
 * same PIN code, same village (post office, in the same district when both are
 * known), same nearby-location landmark, or same district.
 */
export async function findMatchingPatients(db: Pool, area: ClinicArea): Promise<MatchedPatient[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (area.pins.size) {
    conds.push(`REPLACE(u.pin_code, ' ', '') IN (?)`);
    params.push([...area.pins]);
  }
  if (area.districts.size) {
    conds.push(`LOWER(TRIM(u.district)) IN (?)`);
    params.push([...area.districts]);
  }
  if (area.villageNames.size) {
    conds.push(`LOWER(TRIM(u.post_office)) IN (?)`);
    params.push([...area.villageNames]);
  }
  if (area.nearby.size) {
    conds.push(`LOWER(TRIM(u.nearby_location)) IN (?)`);
    params.push([...area.nearby]);
  }
  if (conds.length === 0) return [];

  const [rows] = await db.query<Row[]>(
    `SELECT u.id, u.email, u.pin_code, u.district, u.post_office, u.nearby_location
       FROM users u
      WHERE u.role = 'patient' AND u.status = 'active' AND u.phone IS NOT NULL
        AND (${conds.join(" OR ")})`,
    params,
  );

  const matched: MatchedPatient[] = [];
  for (const u of rows) {
    const district = norm(u.district);
    const village = norm(u.post_office);
    let reason: MatchReason | null = null;
    if (area.pins.has(pinNorm(u.pin_code))) reason = "pin_code";
    else if (
      village &&
      (area.villages.has(`${village}|${district}`) ||
        // District unknown on either side: the post office name alone decides.
        (!district && area.villageNames.has(village)) ||
        area.villages.has(`${village}|`))
    )
      reason = "village";
    else if (norm(u.nearby_location) && area.nearby.has(norm(u.nearby_location))) reason = "nearby_location";
    else if (district && area.districts.has(district)) reason = "district";
    if (reason) {
      matched.push({ userId: String(u.id), email: typeof u.email === "string" && u.email.trim() ? u.email.trim() : null, reason });
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Message content (English / Bengali)
// ---------------------------------------------------------------------------

function servicesLine(s: ClinicSummary, lang: PushLanguage): string {
  const parts: string[] = [];
  if (s.doctorCount > 0) {
    const names = s.doctors.map((d) => (d.specialization ? `${d.name} (${d.specialization})` : d.name)).join(", ");
    const more = s.doctorCount > s.doctors.length ? (lang === "bn" ? ` ও আরও ${s.doctorCount - s.doctors.length} জন` : ` and ${s.doctorCount - s.doctors.length} more`) : "";
    parts.push(lang === "bn" ? `ডাক্তার: ${names}${more}` : `Doctors: ${names}${more}`);
  }
  if (s.labTestCount > 0) {
    parts.push(lang === "bn" ? `${s.labTestCount}টি ল্যাব টেস্ট উপলব্ধ` : `${s.labTestCount} lab test${s.labTestCount === 1 ? "" : "s"} available`);
  }
  return parts.join(lang === "bn" ? "। " : ". ");
}

export function pushMessages(s: ClinicSummary): Record<PushLanguage, FcmMessage> {
  const data = { type: "new_clinic_nearby", clinic_id: s.clinicId, branch_id: s.branchId };
  const where = s.area || s.address;
  const enServices = s.doctorCount > 0
    ? `${s.doctorCount} doctor${s.doctorCount === 1 ? "" : "s"}${s.specializations.length ? ` (${s.specializations.slice(0, 3).join(", ")})` : ""}`
    : `${s.labTestCount} lab test${s.labTestCount === 1 ? "" : "s"}`;
  const bnServices = s.doctorCount > 0
    ? `${s.doctorCount} জন ডাক্তার${s.specializations.length ? ` (${s.specializations.slice(0, 3).join(", ")})` : ""}`
    : `${s.labTestCount}টি ল্যাব টেস্ট`;
  return {
    en: {
      title: `New clinic near you: ${s.clinicName}`,
      body: `${s.clinicName}${where ? `, ${where}` : ""} is now on Jido Healthcare with ${enServices}. Tap to view and book.`,
      data,
    },
    bn: {
      title: `আপনার কাছে নতুন ক্লিনিক: ${s.clinicName}`,
      body: `${s.clinicName}${where ? `, ${where}` : ""} এখন জিডো হেলথকেয়ারে — ${bnServices}। দেখতে ও বুক করতে ট্যাপ করুন।`,
      data,
    },
  };
}

function emailContent(s: ClinicSummary, lang: PushLanguage): { subject: string; body: string } {
  const services = servicesLine(s, lang);
  if (lang === "bn") {
    return {
      subject: `আপনার কাছে নতুন ক্লিনিক: ${s.clinicName}`,
      body: [
        `${s.clinicName} এখন জিডো হেলথকেয়ারে যুক্ত হয়েছে, আপনার এলাকায়।`,
        "",
        `ঠিকানা: ${s.address}`,
        services,
        "",
        "ক্লিনিকটি দেখতে ও অ্যাপয়েন্টমেন্ট বুক করতে জিডো হেলথকেয়ার অ্যাপ খুলুন।",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
    };
  }
  return {
    subject: `New clinic near you: ${s.clinicName}`,
    body: [
      `${s.clinicName} has just joined Jido Healthcare in your area.`,
      "",
      `Address: ${s.address}`,
      services,
      "",
      "Open the Jido Healthcare app to view the clinic and book an appointment.",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

/** In-app payload; the app renders the localized text from these fields. */
function notificationPayload(s: ClinicSummary): Record<string, unknown> {
  return {
    clinic_id: s.clinicId,
    clinic_name: s.clinicName,
    branch_id: s.branchId,
    address: s.address,
    area: s.area,
    doctors: s.doctors,
    doctor_count: s.doctorCount,
    specializations: s.specializations,
    lab_test_count: s.labTestCount,
  };
}

// ---------------------------------------------------------------------------
// Announce
// ---------------------------------------------------------------------------

export interface AnnounceResult {
  clinicId: string;
  recipients: number;
  pushDevices: number;
  pushDelivered: number;
  emailsSent: number;
}

/** Each patient's app language, taken from their most recently registered device. */
async function patientLanguages(db: Pool, userIds: string[]): Promise<Map<string, PushLanguage>> {
  const langs = new Map<string, PushLanguage>();
  for (let i = 0; i < userIds.length; i += 1000) {
    const [rows] = await db.query<Row[]>(
      `SELECT user_id, language FROM device_tokens
        WHERE app = 'patient' AND language IS NOT NULL AND user_id IN (?)
        ORDER BY updated_at ASC`,
      [userIds.slice(i, i + 1000)],
    );
    for (const r of rows) langs.set(String(r.user_id), r.language === "bn" ? "bn" : "en");
  }
  return langs;
}

/**
 * Announces one clinic. Returns null when another process already claimed it.
 * The claim row is written first, so a crash part-way never leads to a second
 * round of notifications for the same clinic.
 */
export async function announceClinic(db: Pool, clinicId: string): Promise<AnnounceResult | null> {
  const loaded = await loadClinicSummary(db, clinicId);
  if (!loaded) return null;
  const { summary, area } = loaded;

  const [claim] = await db.query<ResultSetHeader>(
    `INSERT IGNORE INTO clinic_announcements (clinic_id, status) VALUES (?, 'processing')`,
    [clinicId],
  );
  if (claim.affectedRows === 0) return null;

  const patients = await findMatchingPatients(db, area);
  const payload = JSON.stringify(notificationPayload(summary));

  // Recipient rows + in-app notifications, in chunks. INSERT IGNORE on the
  // (clinic_id, user_id) key keeps this duplicate-proof even if re-entered.
  const notified: MatchedPatient[] = [];
  for (let i = 0; i < patients.length; i += INSERT_CHUNK) {
    const chunk = patients.slice(i, i + INSERT_CHUNK);
    const ids = chunk.map(() => newId());
    const [ins] = await db.query<ResultSetHeader>(
      `INSERT IGNORE INTO clinic_announcement_recipients (clinic_id, user_id, match_reason, notification_id) VALUES ?`,
      [chunk.map((p, j) => [clinicId, p.userId, p.reason, ids[j]])],
    );
    let fresh = chunk;
    let freshIds: string[] = ids;
    if (ins.affectedRows !== chunk.length) {
      // Some were already recorded: only notify the rows this call inserted.
      const [mine] = await db.query<Row[]>(
        `SELECT user_id, notification_id FROM clinic_announcement_recipients
          WHERE clinic_id = ? AND notification_id IN (?)`,
        [clinicId, ids],
      );
      const mineIds = new Map(mine.map((r) => [String(r.user_id), String(r.notification_id)]));
      fresh = chunk.filter((p) => mineIds.has(p.userId));
      freshIds = fresh.map((p) => mineIds.get(p.userId)!);
    }
    if (fresh.length > 0) {
      await db.query(
        `INSERT INTO notifications (id, user_id, branch_id, type, payload_json) VALUES ?`,
        [fresh.map((p, j) => [freshIds[j], p.userId, summary.branchId, "new_clinic_nearby", payload])],
      );
      notified.push(...fresh);
    }
  }

  const userIds = notified.map((p) => p.userId);
  const push = await sendFcmToUsersLocalized(userIds, pushMessages(summary));

  // Email: in the patient's app language when known, otherwise both languages.
  let emailsSent = 0;
  const withEmail = notified.filter((p) => p.email);
  if (withEmail.length > 0) {
    const langs = await patientLanguages(db, withEmail.map((p) => p.userId));
    const en = emailContent(summary, "en");
    const bn = emailContent(summary, "bn");
    for (const p of withEmail) {
      const lang = langs.get(p.userId);
      const content =
        lang === "bn" ? bn : lang === "en" ? en : { subject: `${en.subject} | ${bn.subject}`, body: `${en.body}\n\n—\n\n${bn.body}` };
      try {
        if (await sendEmail(p.email!, content.subject, content.body, patientEmailHtml(content.body))) emailsSent++;
      } catch (err) {
        console.error(`[clinic-announce] email to patient ${p.userId} failed:`, err);
      }
    }
  }

  await db.query(
    `UPDATE clinic_announcements
        SET status = 'sent', recipient_count = ?, push_delivered = ?, email_sent = ?, completed_at = UTC_TIMESTAMP(3)
      WHERE clinic_id = ?`,
    [notified.length, push.delivered, emailsSent, clinicId],
  );
  console.log(
    `[clinic-announce] ${summary.clinicName} (${clinicId}): ${notified.length} patient(s), ${push.delivered}/${push.devices} push, ${emailsSent} email(s).`,
  );

  return { clinicId, recipients: notified.length, pushDevices: push.devices, pushDelivered: push.delivered, emailsSent };
}

/** Clinic ids that are new, bookable and not yet announced (activation is checked per clinic). */
async function candidateClinicIds(db: Pool): Promise<string[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT c.id
       FROM clinics c
       LEFT JOIN clinic_announcements ca ON ca.clinic_id = c.id
      WHERE ca.clinic_id IS NULL
        AND c.deleted_at IS NULL
        AND c.trade_license_validation_status <> 'INVALID'
        AND c.created_at >= UTC_TIMESTAMP(3) - INTERVAL ${ANNOUNCE_WINDOW_DAYS} DAY
        AND EXISTS (SELECT 1 FROM branches b WHERE b.clinic_id = c.id AND b.deleted_at IS NULL)
        AND (
          EXISTS (SELECT 1 FROM doctor_branch_assignments dba
                    JOIN branches b ON b.id = dba.branch_id AND b.deleted_at IS NULL
                   WHERE b.clinic_id = c.id AND dba.is_active = 1)
          OR EXISTS (SELECT 1 FROM branch_lab_tests blt
                       JOIN branches b ON b.id = blt.branch_id AND b.deleted_at IS NULL
                      WHERE blt.clinic_id = c.id AND blt.status = 'active')
        )
      ORDER BY c.created_at ASC
      LIMIT 50`,
  );
  return rows.map((r) => String(r.id));
}

export interface AnnounceSweepResult {
  announced: AnnounceResult[];
  skippedInactive: string[];
}

export async function processClinicAnnouncements(db: Pool): Promise<AnnounceSweepResult> {
  const result: AnnounceSweepResult = { announced: [], skippedInactive: [] };
  const ids = await candidateClinicIds(db);
  if (ids.length === 0) return result;
  const settings = await getPlatformSettings(db);

  for (const clinicId of ids) {
    try {
      const sub = await ensureClinicSubscription(db, clinicId);
      if (computeLiveState(sub, settings.expiring_warning_days).blocked) {
        // Not activated (yet): left unclaimed so it's announced once it is.
        result.skippedInactive.push(clinicId);
        continue;
      }
      const res = await announceClinic(db, clinicId);
      if (res) result.announced.push(res);
    } catch (err) {
      console.error(`[clinic-announce] clinic ${clinicId} failed:`, err);
    }
  }
  return result;
}

let cronStarted = false;
let running = false;

/** In-process scheduler (started from instrumentation.ts) — runs every 15 minutes. */
export function startClinicAnnouncementCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const { pool } = await import("@api/lib/db");
      await processClinicAnnouncements(pool);
    } catch (err) {
      console.error("[clinic-announce] sweep failed:", err);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 60_000).unref?.();
  setInterval(() => void tick(), 15 * 60 * 1000).unref?.();
}

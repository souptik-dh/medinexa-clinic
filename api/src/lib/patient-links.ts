import type { Pool } from "mysql2/promise";
import type { Row } from "./db";

/** One side of a patient_family_links row, as the API shows it. */
export interface PatientLink {
  id: string;
  name: string | null;
  phone: string | null;
  /** What the patient is to the profile (spouse, child, …). */
  relationship: string;
}

/**
 * Family links for a set of patients, both directions:
 * - `family`   = people this account books for (keyed by the profile account),
 * - `profiles` = accounts that book for this person (keyed by the patient).
 * A relative without their own phone is reached through their profiles' phones.
 */
export async function loadPatientLinks(
  pool: Pool,
  ids: string[],
): Promise<{ family: Map<string, PatientLink[]>; profiles: Map<string, PatientLink[]> }> {
  const family = new Map<string, PatientLink[]>();
  const profiles = new Map<string, PatientLink[]>();
  if (ids.length === 0) return { family, profiles };

  const push = (map: Map<string, PatientLink[]>, key: string, link: PatientLink) =>
    map.set(key, [...(map.get(key) ?? []), link]);

  const [links] = await pool.query<Row[]>(
    `SELECT l.profile_user_id, l.patient_id, l.relationship,
            pu.name AS profile_name, pu.phone AS profile_phone,
            mu.name AS member_name, mu.phone AS member_phone
       FROM patient_family_links l
       JOIN users pu ON pu.id = l.profile_user_id
       JOIN users mu ON mu.id = l.patient_id
      WHERE l.profile_user_id IN (?) OR l.patient_id IN (?)
      ORDER BY l.created_at`,
    [ids, ids],
  );
  for (const l of links) {
    push(family, String(l.profile_user_id), {
      id: String(l.patient_id),
      name: l.member_name ?? null,
      phone: l.member_phone ?? null,
      relationship: String(l.relationship),
    });
    push(profiles, String(l.patient_id), {
      id: String(l.profile_user_id),
      name: l.profile_name ?? null,
      phone: l.profile_phone ?? null,
      relationship: String(l.relationship),
    });
  }
  return { family, profiles };
}

import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { badRequest, notFound } from "@api/lib/errors";
import { getOwnedClinic } from "@api/lib/scope";
import {
  addDays,
  computeDateAvailability,
  findCoveringLeave,
  getActiveLeaves,
  getAvailabilityPeriods,
  getBranchSchedule,
  isWeekdayOpen,
  todayInTz,
  weekdayInTz,
  weekdayNameInTz,
} from "@api/lib/availability";
import { getDoctorSpecializations, specializationDisplayName } from "@api/lib/specializations";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Per-branch view of one day (default: tomorrow in each branch's timezone): every
// active branch of the clinic, the doctors scheduled to work there that day, their
// open slots, and how many non-cancelled appointments each already has at that
// branch. Availability comes from computeDateAvailability so it agrees with booking;
// the patient booking cutoff is not applied since this is a staff view.
export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff", "sys_admin"]);
  const clinicId = ctx.params.clinicId;
  const dateParam = ctx.request.nextUrl.searchParams.get("date");
  if (dateParam && !DATE_RE.test(dateParam)) {
    throw badRequest("VALIDATION_ERROR", "date must be YYYY-MM-DD.", "date");
  }

  if (auth.role === "clinic_owner") {
    await getOwnedClinic(pool, clinicId, auth.userId);
  } else {
    const [clinics] = await pool.query<Row[]>(
      `SELECT id FROM clinics WHERE id = ? AND deleted_at IS NULL`,
      [clinicId],
    );
    if (!clinics[0]) throw notFound("CLINIC_NOT_FOUND", "Clinic not found.");
  }

  const branchParams: unknown[] = [clinicId];
  let branchFilter = "";
  if (auth.role === "branch_staff") {
    branchFilter = "AND id = ?";
    branchParams.push(auth.branchId ?? "__none__");
  }
  const [branches] = await pool.query<Row[]>(
    `SELECT id, name, address, city, phone, timezone
       FROM branches
      WHERE clinic_id = ? AND deleted_at IS NULL ${branchFilter}
      ORDER BY name ASC`,
    branchParams,
  );
  if (auth.role === "branch_staff" && branches.length === 0) {
    throw notFound("CLINIC_NOT_FOUND", "Clinic not found.");
  }

  const branchIds = branches.map((b) => String(b.id));
  const dateByBranch = new Map<string, string>();
  for (const b of branches) {
    dateByBranch.set(String(b.id), dateParam ?? addDays(todayInTz(b.timezone), 1));
  }
  const dates = [...new Set(dateByBranch.values())];

  const [assignments] = branchIds.length
    ? await pool.query<Row[]>(
        `SELECT dba.id AS assignment_id, dba.branch_id, dba.fee_amount, dba.currency, dba.slot_type,
                d.id AS doctor_id, d.name, d.doctor_degree, d.photo_url
           FROM doctor_branch_assignments dba
           JOIN doctors d ON d.id = dba.doctor_id AND d.deleted_at IS NULL
          WHERE dba.branch_id IN (?) AND dba.is_active = 1
          ORDER BY d.name ASC`,
        [branchIds],
      )
    : [[] as Row[]];

  const assignmentIds = assignments.map((a) => String(a.assignment_id));
  const doctorIds = [...new Set(assignments.map((a) => String(a.doctor_id)))];
  const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0] ?? "");
  const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0] ?? "");

  const [periods, leaves, specializations, [counts]] = await Promise.all([
    getAvailabilityPeriods(pool, assignmentIds),
    getActiveLeaves(pool, assignmentIds, { from: minDate, to: maxDate }),
    getDoctorSpecializations(pool, doctorIds),
    branchIds.length
      ? pool.query<Row[]>(
          `SELECT branch_id, doctor_id, scheduled_date, status, COUNT(*) AS cnt
             FROM appointments
            WHERE branch_id IN (?) AND scheduled_date IN (?) AND status != 'cancelled'
            GROUP BY branch_id, doctor_id, scheduled_date, status`,
          [branchIds, dates],
        )
      : Promise.resolve([[] as Row[]]),
  ]);

  // key: branch|doctor|date -> { total, by_status }
  const countMap = new Map<string, { total: number; by_status: Record<string, number> }>();
  for (const r of counts) {
    const key = `${r.branch_id}|${r.doctor_id}|${String(r.scheduled_date).slice(0, 10)}`;
    const entry = countMap.get(key) ?? { total: 0, by_status: {} };
    const n = Number(r.cnt);
    entry.total += n;
    entry.by_status[r.status] = n;
    countMap.set(key, entry);
  }

  const result = [];
  for (const b of branches) {
    const branchId = String(b.id);
    const date = dateByBranch.get(branchId)!;
    const today = todayInTz(b.timezone);
    const branchSchedule = await getBranchSchedule(pool, branchId, { from: date, to: date });

    const closure = findCoveringLeave(date, branchSchedule.closures);
    const isOpen = !closure && isWeekdayOpen(branchSchedule, weekdayInTz(date, b.timezone));

    const doctors = [];
    for (const a of isOpen ? assignments.filter((x) => String(x.branch_id) === branchId) : []) {
      const info = await computeDateAvailability(
        pool,
        String(a.doctor_id),
        branchId,
        date,
        b.timezone,
        periods.get(String(a.assignment_id)) ?? { start_date: null, end_date: null },
        leaves.get(String(a.assignment_id)) ?? [],
        today,
        branchSchedule,
        false,
      );
      // Only doctors actually scheduled that day (on leave / no template are skipped).
      if (info.slots.length === 0) continue;

      const appts = countMap.get(`${branchId}|${a.doctor_id}|${date}`) ?? { total: 0, by_status: {} };
      const available = info.slots.filter((s) => s.available);
      doctors.push({
        doctor_id: a.doctor_id,
        name: a.name,
        degree: a.doctor_degree,
        photo_url: a.photo_url,
        specialization: specializationDisplayName(specializations.get(String(a.doctor_id))),
        fee_amount: Number(a.fee_amount),
        currency: a.currency,
        slot_type: a.slot_type,
        status: info.status,
        is_bookable: info.is_bookable,
        total_slots: info.slots.length,
        available_slots_count: available.length,
        available_slots: available.map((s) => ({
          time: s.time,
          capacity: s.capacity,
          remaining: s.remaining,
        })),
        appointments_count: appts.total,
        appointments_by_status: appts.by_status,
      });
    }

    result.push({
      branch_id: branchId,
      name: b.name,
      address: b.address,
      city: b.city,
      phone: b.phone,
      timezone: b.timezone,
      date,
      day: weekdayNameInTz(date, b.timezone, "long"),
      is_open: isOpen,
      closure: closure
        ? { start_date: closure.start_date, end_date: closure.end_date, reason: closure.reason }
        : null,
      doctors,
    });
  }

  return json({ clinic_id: clinicId, branches: result });
});

import { api, json, requestOrigin, encodeCursor, decodeCursor } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles, type AuthContext } from "@api/lib/auth";
import { badRequest, forbidden } from "@api/lib/errors";
import { parsePagination } from "@api/lib/validators";
import { hasPermission, loadStaffPermissions } from "@api/lib/permissions";
import { signPatientDocumentPreviewUrl } from "@api/lib/patient-documents";
import { signFileUrl } from "@api/lib/upload";

const SOURCES = ["clinic_upload", "lab_booking", "patient_upload"] as const;
type Source = (typeof SOURCES)[number];

/**
 * Re-signs a server-stored file link. medical_documents / lab_test_prescriptions keep
 * the signed `/api/v1/files/<name>?expires=…` URL issued at upload time, which is long
 * expired by the time the clinic opens it. Cloudinary (absolute, non-files) URLs pass through.
 */
function freshFileUrl(origin: string, stored: string): string {
  const m = /\/api\/v1\/files\/([^?#]+)/.exec(stored);
  if (m) return signFileUrl(origin, decodeURIComponent(m[1]));
  if (/^https?:\/\//i.test(stored)) return stored;
  return `${origin}${stored.startsWith("/") ? "" : "/"}${stored}`;
}

/** Scope on a table aliased `alias` that has clinic_id + branch_id columns. */
function scopeOn(auth: AuthContext, alias: string, clinicId: string | null, branchId: string | null) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (auth.role === "branch_staff") {
    where.push(`${alias}.branch_id = ?`);
    params.push(auth.branchId ?? "__none__");
  } else {
    where.push(`${alias}.clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = ? AND deleted_at IS NULL)`);
    params.push(auth.userId);
    if (branchId) {
      where.push(`${alias}.branch_id = ?`);
      params.push(branchId);
    }
  }
  if (clinicId) {
    where.push(`${alias}.clinic_id = ?`);
    params.push(clinicId);
  }
  return { sql: where.join(" AND "), params };
}

const escapeLike = (s: string) => `%${s.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

// Every prescription a clinic can see, newest first, from three places:
//  - clinic_upload:  PRESCRIPTION patient documents staff/owner uploaded (incl. ones attached to a lab booking)
//  - lab_booking:    prescriptions the patient attached to a lab booking from the patient app
//  - patient_upload: prescriptions in the patient's own medical documents, for patients
//                    who have a doctor appointment or lab booking in scope
export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  const sp = ctx.request.nextUrl.searchParams;
  const clinicId = sp.get("clinic_id");
  const branchId = sp.get("branch_id");
  const sourceParam = sp.get("source");
  const q = sp.get("q")?.trim() || null;
  const { limit, cursor } = parsePagination(sp);

  // One source, or a comma-separated list (e.g. lab_booking,patient_upload).
  const requested = sourceParam ? sourceParam.split(",").map((s) => s.trim()).filter(Boolean) : [...SOURCES];
  if (requested.some((s) => !(SOURCES as readonly string[]).includes(s))) {
    throw badRequest("VALIDATION_ERROR", `source must be one or more of: ${SOURCES.join(", ")}.`, "source");
  }

  // Staff see a source only with the permission that already guards it elsewhere.
  let allowed: Source[] = [...SOURCES];
  if (auth.role === "branch_staff") {
    const perms = await loadStaffPermissions(pool, auth.branchId ?? "__none__", auth.userId);
    const docs = hasPermission(perms, "patient_documents:view");
    const lab = hasPermission(perms, "lab_appointments:view");
    allowed = SOURCES.filter((s) => (s === "lab_booking" ? lab : docs));
    if (allowed.length === 0) {
      throw forbidden("PERMISSION_DENIED", "You do not have permission to view prescriptions.");
    }
  }
  const wanted = allowed.filter((s) => requested.includes(s));

  const rawOffset = Number(decodeCursor(cursor)?.offset);
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  // Each source is fetched newest-first up to the end of the requested page, then merged.
  const take = offset + limit + 1;
  const like = q ? escapeLike(q) : null;

  // ── clinic_upload ──
  const pdScope = scopeOn(auth, "pd", clinicId, branchId);
  const pdWhere = [`pd.document_type = 'PRESCRIPTION'`, `pd.deleted_at IS NULL`, pdScope.sql];
  const pdParams: unknown[] = [...pdScope.params];
  if (like) {
    pdWhere.push(`(COALESCE(ltap.name, p.name) LIKE ? OR pd.title LIKE ? OR pd.file_name LIKE ? OR la.appointment_number LIKE ?)`);
    pdParams.push(like, like, like, like);
  }
  const pdFrom = `
      FROM patient_documents pd
      JOIN branches b ON b.id = pd.branch_id
      JOIN users p ON p.id = pd.patient_id
      JOIN users ub ON ub.id = pd.uploaded_by
      LEFT JOIN lab_test_prescriptions ltp ON ltp.id = pd.id
      LEFT JOIN lab_test_appointments la ON la.id = ltp.appointment_id
      LEFT JOIN lab_tests lt ON lt.id = la.test_id
      LEFT JOIN lab_test_appointment_patients ltap ON ltap.appointment_id = la.id
     WHERE ${pdWhere.join(" AND ")}`;

  // ── lab_booking ── (a staff upload shares its id with the patient_documents row — listed once, above)
  const laScope = scopeOn(auth, "la", clinicId, branchId);
  const lbWhere = [`NOT EXISTS (SELECT 1 FROM patient_documents x WHERE x.id = ltp.id)`, laScope.sql];
  const lbParams: unknown[] = [...laScope.params];
  if (like) {
    lbWhere.push(`(COALESCE(ltap.name, p.name) LIKE ? OR ltp.file_name LIKE ? OR la.appointment_number LIKE ?)`);
    lbParams.push(like, like, like);
  }
  const lbFrom = `
      FROM lab_test_prescriptions ltp
      JOIN lab_test_appointments la ON la.id = ltp.appointment_id
      JOIN lab_tests lt ON lt.id = la.test_id
      JOIN branches b ON b.id = la.branch_id
      JOIN users p ON p.id = ltp.patient_id
      LEFT JOIN lab_test_appointment_patients ltap ON ltap.appointment_id = la.id
     WHERE ${lbWhere.join(" AND ")}`;

  // ── patient_upload ──
  const apScope = scopeOn(auth, "a", clinicId, branchId);
  const labScope = scopeOn(auth, "lx", clinicId, branchId);
  const ltScope = scopeOn(auth, "ly", clinicId, branchId);
  const puWhere = [
    `md.category = 'prescription'`,
    `(md.patient_id IN (
        SELECT COALESCE(ap.patient_id, a.patient_id)
          FROM appointments a
          LEFT JOIN appointment_patients ap ON ap.appointment_id = a.id
         WHERE a.status != 'cancelled' AND ${apScope.sql})
      OR md.patient_id IN (
        SELECT COALESCE(lxp.patient_id, lx.patient_id)
          FROM lab_test_appointments lx
          LEFT JOIN lab_test_appointment_patients lxp ON lxp.appointment_id = lx.id
         WHERE ${labScope.sql}))`,
    // Already listed as a lab_booking prescription.
    `NOT EXISTS (
        SELECT 1 FROM lab_test_prescriptions y
          JOIN lab_test_appointments ly ON ly.id = y.appointment_id
         WHERE y.id = md.id AND ${ltScope.sql})`,
  ];
  const puParams: unknown[] = [...apScope.params, ...labScope.params, ...ltScope.params];
  if (like) {
    puWhere.push(`(p.name LIKE ? OR md.file_name LIKE ?)`);
    puParams.push(like, like);
  }
  const puFrom = `
      FROM medical_documents md
      JOIN users p ON p.id = md.patient_id
     WHERE ${puWhere.join(" AND ")}`;

  const queries = {
    clinic_upload: {
      list: `SELECT pd.id, pd.patient_id, COALESCE(ltap.name, p.name) AS patient_name, p.photo_url AS patient_photo_url,
                    pd.branch_id, b.name AS branch_name, pd.title, pd.description, pd.file_name, pd.mime_type,
                    pd.file_size, pd.uploaded_at, ub.name AS uploaded_by_name,
                    la.id AS lab_id, la.appointment_number, la.appointment_date, la.status AS lab_status, lt.name AS test_name
             ${pdFrom} ORDER BY pd.uploaded_at DESC, pd.id DESC LIMIT ?`,
      count: `SELECT COUNT(*) AS n ${pdFrom}`,
      params: pdParams,
    },
    lab_booking: {
      list: `SELECT ltp.id, ltp.patient_id, COALESCE(ltap.name, p.name) AS patient_name, p.photo_url AS patient_photo_url,
                    la.branch_id, b.name AS branch_name, ltp.file_name, ltp.file_url, ltp.mime_type,
                    ltp.file_size, ltp.uploaded_at,
                    la.id AS lab_id, la.appointment_number, la.appointment_date, la.status AS lab_status, lt.name AS test_name
             ${lbFrom} ORDER BY ltp.uploaded_at DESC, ltp.id DESC LIMIT ?`,
      count: `SELECT COUNT(*) AS n ${lbFrom}`,
      params: lbParams,
    },
    patient_upload: {
      list: `SELECT md.id, md.patient_id, p.name AS patient_name, p.photo_url AS patient_photo_url,
                    md.file_name, md.file_url, md.mime_type, md.size_bytes AS file_size, md.uploaded_at
             ${puFrom} ORDER BY md.uploaded_at DESC, md.id DESC LIMIT ?`,
      count: `SELECT COUNT(*) AS n ${puFrom}`,
      params: puParams,
    },
  } as const;

  const results = await Promise.all(
    allowed.map(async (s) => {
      const def = queries[s];
      const [[countRows], listRows] = await Promise.all([
        pool.query<Row[]>(def.count, def.params),
        wanted.includes(s) ? pool.query<Row[]>(def.list, [...def.params, take]).then(([r]) => r) : Promise.resolve([] as Row[]),
      ]);
      return { source: s, count: Number(countRows[0]?.n ?? 0), rows: listRows.map((r): Record<string, unknown> => ({ ...r, source: s })) };
    }),
  );

  const merged = results
    .flatMap((r) => r.rows)
    .sort((a, b) =>
      String(b.uploaded_at).localeCompare(String(a.uploaded_at)) || String(b.id).localeCompare(String(a.id)),
    );
  const page = merged.slice(offset, offset + limit);
  const hasMore = merged.length > offset + limit;
  const origin = requestOrigin(ctx.request);

  const counts: Record<Source, number> = { clinic_upload: 0, lab_booking: 0, patient_upload: 0 };
  for (const r of results) counts[r.source] = r.count;

  return json({
    items: page.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title ?? null,
      description: r.description ?? null,
      file_name: r.file_name,
      mime_type: r.mime_type,
      file_size: Number(r.file_size),
      file_url:
        r.source === "clinic_upload"
          ? signPatientDocumentPreviewUrl(origin, String(r.id))
          : freshFileUrl(origin, String(r.file_url)),
      uploaded_at: r.uploaded_at,
      uploaded_by_name: r.uploaded_by_name ?? null,
      patient: { id: r.patient_id, name: r.patient_name, photo_url: r.patient_photo_url ?? null },
      branch: r.branch_id ? { id: r.branch_id, name: r.branch_name } : null,
      lab_appointment: r.lab_id
        ? {
            id: r.lab_id,
            appointment_number: r.appointment_number,
            appointment_date: String(r.appointment_date).slice(0, 10),
            status: r.lab_status,
            test_name: r.test_name,
          }
        : null,
    })),
    counts: { ...counts, total: counts.clinic_upload + counts.lab_booking + counts.patient_upload },
    allowed_sources: allowed,
    next_cursor: hasMore ? encodeCursor({ offset: offset + page.length }) : null,
  });
});

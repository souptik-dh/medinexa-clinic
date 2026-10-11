import { z } from "zod";
import { api, json, noContent, readJson } from "@api/lib/http";
import { pool, withTransaction, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedBranch } from "@api/lib/scope";
import { BRANCH_STAFF_PERMISSIONS, parsePermissions, assertBranchStaffPermission } from "@api/lib/permissions";
import { parseBody, phoneSchema, optionalEmailSchema } from "@api/lib/validators";
import { badRequest, conflict, isUniqueViolation, notFound } from "@api/lib/errors";

type Auth = ReturnType<typeof requireRoles>;

/** The owner of the branch, or branch staff holding staff:manage. */
async function assertCanManageStaff(auth: Auth, branchId: string): Promise<void> {
  if (auth.role === "clinic_owner") {
    await getOwnedBranch(pool, branchId, auth.userId);
  } else {
    await assertBranchStaffPermission(pool, auth, branchId, "staff:manage");
  }
}

async function loadStaff(branchId: string, staffId: string): Promise<Row | undefined> {
  const [rows] = await pool.query<Row[]>(
    `SELECT bs.id, bs.branch_id, bs.user_id, u.name, u.email, u.phone, u.photo_url,
            bs.added_by, bs.permissions_json, bs.created_at
       FROM branch_staff bs
       JOIN users u ON u.id = bs.user_id
      WHERE bs.id = ? AND bs.branch_id = ?`,
    [staffId, branchId],
  );
  return rows[0];
}

// Same shape as GET /branches/:id/staff items.
function serializeStaff(r: Row) {
  return {
    id: r.id,
    branch_id: r.branch_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    photo_url: r.photo_url ?? null,
    added_by: r.added_by,
    permissions: parsePermissions(r.permissions_json),
    created_at: r.created_at,
  };
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    phone: phoneSchema.optional(),
    // "" or null clears the email; leaving it out keeps it.
    email: z.preprocess((v) => (v === "" ? null : v), optionalEmailSchema),
    permissions: z.array(z.enum(BRANCH_STAFF_PERMISSIONS)).optional(),
  })
  .strict();

/**
 * Edits a staff member — name, phone (their OTP login number), email and/or
 * permissions, any subset in one request. The phone must not belong to another
 * account.
 */
export const PATCH = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  const { id: branchId, staffId } = ctx.params;
  await assertCanManageStaff(auth, branchId);

  const body = parseBody(patchSchema, await readJson(ctx.request));
  if (body.name === undefined && body.phone === undefined && body.email === undefined && body.permissions === undefined) {
    throw badRequest("VALIDATION_ERROR", "Nothing to update.");
  }

  const current = await loadStaff(branchId, staffId);
  if (!current) throw notFound("STAFF_NOT_FOUND", "Staff member not found.");

  const userSets: string[] = [];
  const userParams: unknown[] = [];
  if (body.name !== undefined) {
    userSets.push("name = ?");
    userParams.push(body.name);
  }
  if (body.email !== undefined) {
    userSets.push("email = ?");
    userParams.push(body.email ?? null);
  }
  if (body.phone !== undefined && body.phone !== current.phone) {
    // A new login number is unverified until the staff member signs in with it.
    userSets.push("phone = ?", "phone_verified = 0");
    userParams.push(body.phone);
  }

  try {
    await withTransaction(async (conn) => {
      if (userSets.length > 0) {
        await conn.query(`UPDATE users SET ${userSets.join(", ")} WHERE id = ?`, [...userParams, current.user_id]);
      }
      if (body.permissions !== undefined) {
        await conn.query(`UPDATE branch_staff SET permissions_json = ? WHERE id = ?`, [
          JSON.stringify([...new Set(body.permissions)]),
          staffId,
        ]);
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict("PHONE_ALREADY_REGISTERED", "This phone number is already used by another account.");
    }
    throw err;
  }

  const updated = await loadStaff(branchId, staffId);
  return json(serializeStaff(updated!));
});

export const DELETE = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  const { id: branchId, staffId } = ctx.params;
  await assertCanManageStaff(auth, branchId);

  await pool.query(`DELETE FROM branch_staff WHERE id = ? AND branch_id = ?`, [staffId, branchId]);
  return noContent();
});

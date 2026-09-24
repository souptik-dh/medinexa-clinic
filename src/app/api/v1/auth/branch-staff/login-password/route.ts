import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { parseBody, phoneSchema } from "@api/lib/validators";
import { loginWithPassword, loadRoleBindings } from "@api/lib/auth-flows";
import { loadStaffPermissions } from "@api/lib/permissions";
import { pool } from "@api/lib/db";

const schema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

/**
 * Alternative to the OTP flow (POST /auth/branch-staff/login + verify-otp)
 * for a staff member who has set a password via POST /auth/set-password.
 * Mirrors verify-otp's response shape (branch_id + permissions on the user).
 */
export const POST = api({ rateLimit: 20, rateKey: "ip" }, async (ctx) => {
  const body = parseBody(schema, await readJson(ctx.request));
  const result = await loginWithPassword(body.phone, body.password, "branch_staff");

  const { branchId } = await loadRoleBindings(result.user.id, "branch_staff");
  const permissions = branchId ? await loadStaffPermissions(pool, branchId, result.user.id) : [];

  return json({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    user: {
      ...result.user,
      branch_id: branchId,
      permissions,
    },
  });
});

import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { parseBody, phoneSchema } from "@api/lib/validators";
import { pool, type Row } from "@api/lib/db";
import { generateOtp, hashToken } from "@api/lib/auth";
import { newId } from "@api/lib/ids";
import { deliverOtp, sendOtpStatus } from "@api/lib/auth-flows";
import { forbidden } from "@api/lib/errors";

const schema = z.object({ phone: phoneSchema });

export const POST = api({ rateLimit: 20, rateKey: "ip" }, async (ctx) => {
  const body = parseBody(schema, await readJson(ctx.request));

  const [users] = await pool.query<Row[]>(
    `SELECT u.id, u.email, u.phone
       FROM users u
       JOIN branch_staff bs ON bs.user_id = u.id
      WHERE u.phone = ? AND u.role = 'branch_staff' AND u.status = 'active'`,
    [body.phone],
  );

  if (!users[0]) {
    throw forbidden(
      "NOT_BRANCH_STAFF",
      "Access Denied: If an account exists for this phone number, it is not registered as Branch Staff.",
    );
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  await pool.query(
    `INSERT INTO otp_codes (id, phone, email, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, 'branch_staff_login', ?, ?)`,
    [newId(), body.phone, users[0].email ?? null, hashToken(`${body.phone}:${otp}`), expiresAt],
  );
  const result = await deliverOtp({
    phone: body.phone,
    email: users[0].email ?? null,
    otp,
    expiryMinutes: 10,
  });

  return json(result, sendOtpStatus(result));
});

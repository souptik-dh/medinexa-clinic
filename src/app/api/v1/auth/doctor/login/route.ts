import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { parseBody, phoneSchema } from "@api/lib/validators";
import { sendPhoneOtp, sendOtpStatus } from "@api/lib/auth-flows";
import { pool, type Row } from "@api/lib/db";

const schema = z.object({ phone: phoneSchema });

/**
 * Doctor login, step 1: sends a one-time code to the phone. Step 2 verifies
 * via POST /auth/doctor/verify-otp.
 */
export const POST = api({ rateLimit: 20, rateKey: "ip" }, async (ctx) => {
  const body = parseBody(schema, await readJson(ctx.request));

  const [users] = await pool.query<Row[]>(
    `SELECT email FROM users WHERE phone = ? AND role = 'doctor' AND status = 'active' LIMIT 1`,
    [body.phone],
  );
  const result = await sendPhoneOtp({
    phone: body.phone,
    email: users[0]?.email ?? null,
    purpose: "doctor_login",
  });
  return json(result, sendOtpStatus(result));
});

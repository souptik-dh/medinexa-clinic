import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { parseBody, phoneSchema } from "@api/lib/validators";
import { loginWithPassword } from "@api/lib/auth-flows";

const schema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

/**
 * Alternative to the OTP flow (POST /auth/patient/login + verify-otp) for a
 * patient who has already set a password via POST /auth/set-password.
 */
export const POST = api({ rateLimit: 20, rateKey: "ip" }, async (ctx) => {
  const body = parseBody(schema, await readJson(ctx.request));
  const result = await loginWithPassword(body.phone, body.password, "patient");
  return json(result);
});

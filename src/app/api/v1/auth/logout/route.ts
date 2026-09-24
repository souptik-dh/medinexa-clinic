import { z } from "zod";
import { api, noContent, readJson } from "@api/lib/http";
import { parseBody } from "@api/lib/validators";
import { requireRoles, revokeRefreshToken, invalidateUserCache } from "@api/lib/auth";

const schema = z.object({
  refresh_token: z.string().min(1),
});

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "clinic_owner", "branch_staff", "doctor"]);
  const body = parseBody(schema, await readJson(ctx.request));
  await revokeRefreshToken(body.refresh_token);
  invalidateUserCache(auth.userId);
  return noContent();
});

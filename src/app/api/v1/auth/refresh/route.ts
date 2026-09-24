import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { parseBody } from "@api/lib/validators";
import { rotateRefreshToken } from "@api/lib/auth";

const schema = z.object({
  refresh_token: z.string().min(1),
});

export const POST = api({ rateLimit: 20, rateKey: "ip" }, async (ctx) => {
  const body = parseBody(schema, await readJson(ctx.request));
  const tokens = await rotateRefreshToken(body.refresh_token);
  return json(tokens);
});

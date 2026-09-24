import { api, json } from "@api/lib/http";
import { ping } from "@api/lib/db";

export const GET = api({ rateLimit: 120, rateKey: "ip" }, async () => {
  try {
    await ping();
  } catch {
    return json({ status: "error", db: "down" }, 503);
  }
  return json({ status: "ok", db: "up" });
});

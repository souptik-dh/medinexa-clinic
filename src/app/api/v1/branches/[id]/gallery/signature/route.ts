import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedBranch } from "@api/lib/scope";
import { createImageUploadSignature } from "@api/lib/cloudinary";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  await getOwnedBranch(pool, ctx.params.id, auth.userId);
  return json(createImageUploadSignature("branches/gallery"));
});

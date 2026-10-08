import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedClinic } from "@api/lib/scope";
import { createImageUploadSignature } from "@api/lib/cloudinary";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  await getOwnedClinic(pool, ctx.params.clinicId, auth.userId);
  return json(createImageUploadSignature("clinics"));
});

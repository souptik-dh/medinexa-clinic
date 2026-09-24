import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { createImageUploadSignature } from "@api/lib/cloudinary";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  requireRoles(ctx.auth, ["patient"]);
  return json(createImageUploadSignature("patients"));
});

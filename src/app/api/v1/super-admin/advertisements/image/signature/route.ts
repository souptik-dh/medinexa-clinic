import { api, json } from "@api/lib/http";
import { requireSuperAdmin } from "@api/lib/super-admin";
import { createImageUploadSignature } from "@api/lib/cloudinary";
import { AD_IMAGE_FOLDER } from "@api/lib/advertisements";

/** Signed Cloudinary upload grant for an advertisement banner image. */
export const POST = api({ rateLimit: 60 }, async (ctx) => {
  await requireSuperAdmin(ctx.auth);
  return json(createImageUploadSignature(AD_IMAGE_FOLDER));
});

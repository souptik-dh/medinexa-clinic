import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedClinic } from "@api/lib/scope";
import { parseBody } from "@api/lib/validators";
import { assertPublicId, cloudinaryImageUrl, deleteCloudinaryAsset, getCloudinary } from "@api/lib/cloudinary";

const schema = z.object({
  public_id: z.string().trim().min(1).max(255),
});

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  const clinic = await getOwnedClinic(pool, ctx.params.clinicId, auth.userId);

  const body = parseBody(schema, await readJson(ctx.request));
  const publicId = assertPublicId(body.public_id, "clinics");
  const photoUrl = cloudinaryImageUrl(getCloudinary().cloudName, publicId);

  await pool.query(`UPDATE clinics SET photo_url = ? WHERE id = ?`, [photoUrl, clinic.id]);
  if (clinic.photo_url !== photoUrl) await deleteCloudinaryAsset(clinic.photo_url);
  return json({ photo_url: photoUrl });
});

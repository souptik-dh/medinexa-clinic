import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { parseBody } from "@api/lib/validators";
import { assertPublicId, cloudinaryImageUrl, deleteCloudinaryAsset, getCloudinary } from "@api/lib/cloudinary";

const schema = z.object({
  public_id: z.string().trim().min(1).max(255),
});

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  const body = parseBody(schema, await readJson(ctx.request));
  const publicId = assertPublicId(body.public_id, "clinic-owners");
  const photoUrl = cloudinaryImageUrl(getCloudinary().cloudName, publicId);

  const [rows] = await pool.query<Row[]>(`SELECT photo_url FROM users WHERE id = ?`, [auth.userId]);
  await pool.query(`UPDATE users SET photo_url = ? WHERE id = ?`, [photoUrl, auth.userId]);
  if (rows[0] && rows[0].photo_url !== photoUrl) await deleteCloudinaryAsset(rows[0].photo_url);
  return json({ photo_url: photoUrl });
});

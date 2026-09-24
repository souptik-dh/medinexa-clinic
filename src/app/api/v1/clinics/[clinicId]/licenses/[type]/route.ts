import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedClinic } from "@api/lib/scope";
import { uploadDocumentToCloudinary } from "@api/lib/cloudinary";
import { licenseColumns } from "@api/lib/licenses";

const LICENSE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  const clinic = await getOwnedClinic(pool, ctx.params.clinicId, auth.userId);
  const { url: urlColumn } = licenseColumns(ctx.params.type);

  const form = await ctx.request.formData();
  const uploaded = await uploadDocumentToCloudinary(
    form.get("file"),
    "clinics/licenses",
    MAX_BYTES,
    LICENSE_MIMES,
  );

  await pool.query(`UPDATE clinics SET ${urlColumn} = ? WHERE id = ?`, [uploaded.url, clinic.id]);
  return json({ type: ctx.params.type, url: uploaded.url });
});

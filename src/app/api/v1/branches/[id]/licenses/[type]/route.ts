import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedBranch } from "@api/lib/scope";
import { uploadDocumentToCloudinary } from "@api/lib/cloudinary";
import { licenseColumns } from "@api/lib/licenses";

const LICENSE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  const branch = await getOwnedBranch(pool, ctx.params.id, auth.userId);
  const { url: urlColumn } = licenseColumns(ctx.params.type);

  const form = await ctx.request.formData();
  const uploaded = await uploadDocumentToCloudinary(
    form.get("file"),
    "branches/licenses",
    MAX_BYTES,
    LICENSE_MIMES,
  );

  await pool.query(`UPDATE branches SET ${urlColumn} = ? WHERE id = ?`, [uploaded.url, branch.id]);
  return json({ type: ctx.params.type, url: uploaded.url });
});

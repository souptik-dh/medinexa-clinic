import { z } from "zod";
import { api, json, readJson } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireRoles } from "@api/lib/auth";
import { getOwnedClinic } from "@api/lib/scope";

const bodySchema = z.object({
  trade_license_number: z.string().trim().min(1).max(100),
  status: z.enum(["PENDING", "VALID", "INVALID"]),
});

// Saves the outcome of a trade license check the moment it finishes, without waiting
// for the rest of the clinic form. The mobile app runs the PRDEODB lookup from the
// device (the portal drops connections from this server's IP) and reports the result
// here, so it's stored as sent — same trust model as trade_license_validation_status
// on PATCH /clinics/:clinicId. Writes the number too, so the stored status always
// belongs to the number it was checked for.
export const PUT = api({ rateLimit: 60 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner"]);
  const clinic = await getOwnedClinic(pool, ctx.params.clinicId, auth.userId);
  const body = parseBody(bodySchema, await readJson(ctx.request));

  const validated = body.status === "VALID";
  const validatedAt = validated ? new Date() : null;
  await pool.query(
    `UPDATE clinics
        SET trade_license_number = ?, trade_license_validated = ?,
            trade_license_validation_status = ?, trade_license_validated_at = ?
      WHERE id = ?`,
    [body.trade_license_number, validated, body.status, validatedAt, clinic.id],
  );

  return json({
    clinic_id: clinic.id,
    trade_license_number: body.trade_license_number,
    trade_license_validated: validated,
    trade_license_validation_status: body.status,
    trade_license_validated_at: validatedAt?.toISOString() ?? null,
  });
});

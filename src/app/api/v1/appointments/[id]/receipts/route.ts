import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getAppointmentInScope } from "@api/lib/appointments";
import { getReceiptsForSource, serializeReceipt } from "@api/lib/receipts";

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "branch_staff", "doctor", "clinic_owner"]);
  await getAppointmentInScope(pool, ctx.params.id, auth);

  const receipts = await getReceiptsForSource(pool, "appointment", ctx.params.id);
  return json({ data: receipts.map(serializeReceipt) });
});

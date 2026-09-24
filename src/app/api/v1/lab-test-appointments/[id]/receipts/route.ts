import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getLabTestAppointmentInScope } from "@api/lib/lab-tests";
import { getReceiptsForSource, serializeReceipt } from "@api/lib/receipts";

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "branch_staff", "clinic_owner"]);
  await getLabTestAppointmentInScope(pool, ctx.params.id, auth);

  const receipts = await getReceiptsForSource(pool, "lab_test_appointment", ctx.params.id);
  return json({ data: receipts.map(serializeReceipt) });
});

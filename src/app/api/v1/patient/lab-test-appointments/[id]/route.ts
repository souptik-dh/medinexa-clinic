import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { getLabTestAppointmentInScope, serializeLabTestAppointment } from "@api/lib/lab-tests";

export const GET = api({ rateLimit: 120 }, async (ctx) => {
  requireRoles(ctx.auth, ["patient", "clinic_owner", "branch_staff", "sys_admin"]);
  const { id } = ctx.params;

  const row = await getLabTestAppointmentInScope(pool, id, ctx.auth!);
  return json(serializeLabTestAppointment(row));
});

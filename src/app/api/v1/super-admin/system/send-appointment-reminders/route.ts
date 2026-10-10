import { api, json, clientIp } from "@api/lib/http";
import { requireSuperAdmin, logSuperAdminAction } from "@api/lib/super-admin";
import { processAppointmentReminders } from "@api/lib/appointment-reminders";
import { withTransaction } from "@api/lib/db";

/**
 * Scheduled-processing trigger — run once a day (morning, branch time) by an external
 * scheduler. Callable two ways:
 *  1. By a Super Admin (Bearer token), or
 *  2. By an external scheduler sending the `x-cron-secret` header matching CRON_SECRET.
 * Sends patients a push + in-app + email reminder for each confirmed doctor / approved
 * lab appointment 1–3 days away (lab reminders include the test's precautions).
 * Idempotent — each appointment is reminded at most once per day however often it runs.
 */
export const POST = api({ rateLimit: 30 }, async (ctx) => {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = ctx.request.headers.get("x-cron-secret");

  if (!(headerSecret && cronSecret && headerSecret === cronSecret)) {
    const admin = await requireSuperAdmin(ctx.auth);
    await withTransaction(async (conn) => {
      await logSuperAdminAction(conn, {
        actorUserId: admin.userId,
        action: "appointments.reminder_sweep_triggered",
        resourceType: "appointment",
        resourceId: null,
        ipAddress: clientIp(ctx.request),
      });
    });
  }

  const result = await processAppointmentReminders();
  return json({ message: "Appointment reminder sweep complete.", result });
});

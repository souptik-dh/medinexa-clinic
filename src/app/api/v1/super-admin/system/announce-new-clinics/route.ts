import { api, json, clientIp } from "@api/lib/http";
import { pool, withTransaction } from "@api/lib/db";
import { requireSuperAdmin, logSuperAdminAction } from "@api/lib/super-admin";
import { processClinicAnnouncements, startClinicAnnouncementCron } from "@api/lib/clinic-announcements";

/**
 * Runs the "new clinic near you" sweep now instead of waiting for the 15-minute
 * in-process cron. Callable by a Super Admin (Bearer token) or an external scheduler
 * sending `x-cron-secret` = CRON_SECRET. Idempotent: a clinic is announced at most once.
 */
export const POST = api({ rateLimit: 30 }, async (ctx) => {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = ctx.request.headers.get("x-cron-secret");

  if (!(headerSecret && cronSecret && headerSecret === cronSecret)) {
    const admin = await requireSuperAdmin(ctx.auth);
    await withTransaction(async (conn) => {
      await logSuperAdminAction(conn, {
        actorUserId: admin.userId,
        action: "clinic_announcement.sweep_triggered",
        resourceType: "clinic_announcement",
        resourceId: null,
        ipAddress: clientIp(ctx.request),
      });
    });
  }

  startClinicAnnouncementCron();
  const result = await processClinicAnnouncements(pool);
  return json({
    message: `Announced ${result.announced.length} new clinic(s).`,
    announced: result.announced.map((a) => ({
      clinic_id: a.clinicId,
      recipients: a.recipients,
      push_devices: a.pushDevices,
      push_delivered: a.pushDelivered,
      emails_sent: a.emailsSent,
    })),
    skipped_inactive: result.skippedInactive,
  });
});

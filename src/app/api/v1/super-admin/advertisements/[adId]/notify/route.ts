import { api, json, readJson, clientIp } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireSuperAdmin, logSuperAdminAction } from "@api/lib/super-admin";
import { conflict, notFound } from "@api/lib/errors";
import { broadcastFcm } from "@api/lib/fcm";
import { AD_SELECT, LIVE_AD_CONDITION, adNotifySchema, adPushData, adPushImageUrl, serializeAd } from "@api/lib/advertisements";

/**
 * Pushes an advertisement to every registered Patient App device. Title/body default
 * to the ad's own title/description. Only a live ad can be pushed — tapping the
 * notification opens the ad's target, which should still be showing on the dashboard.
 */
export const POST = api({ rateLimit: 10 }, async (ctx) => {
  const admin = await requireSuperAdmin(ctx.auth);
  const { adId } = ctx.params;
  const body = parseBody(adNotifySchema, await readJson(ctx.request));

  const [rows] = await pool.query<Row[]>(
    `SELECT a.*, (${LIVE_AD_CONDITION}) AS is_live FROM advertisements a WHERE a.id = ?`,
    [adId],
  );
  const ad = rows[0];
  if (!ad) throw notFound("AD_NOT_FOUND", "Advertisement not found.");
  if (!Number(ad.is_live)) {
    throw conflict("AD_NOT_LIVE", "Only an active advertisement inside its schedule can be sent to patients.");
  }

  const title: string = body.title ?? ad.title;
  const text: string = body.body ?? ad.description ?? ad.sponsor_name ?? "Tap to learn more.";
  const result = await broadcastFcm({ title, body: text, data: adPushData(ad), imageUrl: adPushImageUrl(ad) });

  await pool.query(
    `UPDATE advertisements SET push_sent_at = UTC_TIMESTAMP(3), push_sent_count = ? WHERE id = ?`,
    [result.delivered, adId],
  );
  await logSuperAdminAction(pool, {
    actorUserId: admin.userId,
    action: "advertisement.notified",
    resourceType: "advertisement",
    resourceId: adId,
    changes: { title, body: text, devices: result.devices, delivered: result.delivered },
    ipAddress: clientIp(ctx.request),
  });

  const [after] = await pool.query<Row[]>(`${AD_SELECT} WHERE a.id = ?`, [adId]);
  return json({
    message: `Notification sent to ${result.delivered} of ${result.devices} patient device(s).`,
    devices: result.devices,
    delivered: result.delivered,
    advertisement: serializeAd(after[0]),
  });
});

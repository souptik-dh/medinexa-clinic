import { api, json, readJson, clientIp } from "@api/lib/http";
import { pool, withTransaction, parseDbTimestamp, type Row } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireSuperAdmin, logSuperAdminAction } from "@api/lib/super-admin";
import { notFound } from "@api/lib/errors";
import { deleteCloudinaryAsset } from "@api/lib/cloudinary";
import {
  AD_SELECT,
  adImageUrl,
  adUpdateSchema,
  assertSchedule,
  resolveLinkValue,
  serializeAd,
} from "@api/lib/advertisements";

async function loadAd(adId: string): Promise<Row> {
  const [rows] = await pool.query<Row[]>(`${AD_SELECT} WHERE a.id = ?`, [adId]);
  if (!rows[0]) throw notFound("AD_NOT_FOUND", "Advertisement not found.");
  return rows[0];
}

const dbDate = (v: unknown): Date | null => (typeof v === "string" ? parseDbTimestamp(v) : null);

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  await requireSuperAdmin(ctx.auth);
  return json({ advertisement: serializeAd(await loadAd(ctx.params.adId)) });
});

/** Partial update. Replacing the image deletes the previous one from Cloudinary. */
export const PATCH = api({ rateLimit: 60 }, async (ctx) => {
  const admin = await requireSuperAdmin(ctx.auth);
  const { adId } = ctx.params;
  const body = parseBody(adUpdateSchema, await readJson(ctx.request));
  const current = await loadAd(adId);

  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    params.push(value);
  };

  if (body.title !== undefined) set("title", body.title);
  if (body.description !== undefined) set("description", body.description);
  if (body.sponsor_name !== undefined) set("sponsor_name", body.sponsor_name);
  if (body.category !== undefined) set("category", body.category);
  if (body.placement !== undefined) set("placement", body.placement);
  if (body.cta_label !== undefined) set("cta_label", body.cta_label);
  if (body.is_active !== undefined) set("is_active", body.is_active ? 1 : 0);
  if (body.sort_order !== undefined) set("sort_order", body.sort_order);

  let newImageUrl: string | null = null;
  if (body.image_public_id !== undefined) {
    newImageUrl = adImageUrl(body.image_public_id);
    set("image_url", newImageUrl);
  }

  if (body.link_type !== undefined || body.link_value !== undefined) {
    const linkType = body.link_type ?? current.link_type;
    const linkValue = body.link_value !== undefined ? body.link_value : current.link_value;
    set("link_type", linkType);
    set("link_value", await resolveLinkValue(pool, linkType, linkValue));
  }

  if (body.starts_at !== undefined || body.ends_at !== undefined) {
    const startsAt = body.starts_at !== undefined ? body.starts_at : dbDate(current.starts_at);
    const endsAt = body.ends_at !== undefined ? body.ends_at : dbDate(current.ends_at);
    assertSchedule(startsAt, endsAt);
    if (body.starts_at !== undefined) set("starts_at", body.starts_at);
    if (body.ends_at !== undefined) set("ends_at", body.ends_at);
  }

  if (sets.length > 0) {
    await withTransaction(async (conn) => {
      await conn.query(`UPDATE advertisements SET ${sets.join(", ")} WHERE id = ?`, [...params, adId]);
      await logSuperAdminAction(conn, {
        actorUserId: admin.userId,
        action: "advertisement.updated",
        resourceType: "advertisement",
        resourceId: adId,
        changes: Object.fromEntries(Object.entries(body).filter(([k]) => k !== "image_public_id")),
        ipAddress: clientIp(ctx.request),
      });
    });
    if (newImageUrl && current.image_url !== newImageUrl) await deleteCloudinaryAsset(current.image_url);
  }

  return json({ message: "Advertisement updated.", advertisement: serializeAd(await loadAd(adId)) });
});

export const DELETE = api({ rateLimit: 30 }, async (ctx) => {
  const admin = await requireSuperAdmin(ctx.auth);
  const { adId } = ctx.params;
  const current = await loadAd(adId);

  await withTransaction(async (conn) => {
    await conn.query(`DELETE FROM advertisements WHERE id = ?`, [adId]);
    await logSuperAdminAction(conn, {
      actorUserId: admin.userId,
      action: "advertisement.deleted",
      resourceType: "advertisement",
      resourceId: adId,
      changes: { title: current.title },
      ipAddress: clientIp(ctx.request),
    });
  });
  await deleteCloudinaryAsset(current.image_url);

  return json({ message: "Advertisement deleted." });
});

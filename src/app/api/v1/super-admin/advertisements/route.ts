import { api, json, readJson, clientIp } from "@api/lib/http";
import { pool, withTransaction, type Row } from "@api/lib/db";
import { parseBody } from "@api/lib/validators";
import { requireSuperAdmin, logSuperAdminAction } from "@api/lib/super-admin";
import { newId } from "@api/lib/ids";
import {
  AD_SELECT,
  adCreateSchema,
  adImageUrl,
  assertSchedule,
  resolveLinkValue,
  serializeAd,
} from "@api/lib/advertisements";

/**
 * GET — every advertisement (live, scheduled, expired and inactive), in carousel order.
 * POST — creates an advertisement. Pushing it to patients is a separate, explicit
 * step: POST /super-admin/advertisements/{adId}/notify.
 */
export const GET = api({ rateLimit: 200 }, async (ctx) => {
  await requireSuperAdmin(ctx.auth);
  const [rows] = await pool.query<Row[]>(`${AD_SELECT} ORDER BY a.sort_order ASC, a.created_at DESC`);
  return json({ items: rows.map((r) => serializeAd(r)) });
});

export const POST = api({ rateLimit: 30 }, async (ctx) => {
  const admin = await requireSuperAdmin(ctx.auth);
  const body = parseBody(adCreateSchema, await readJson(ctx.request));
  assertSchedule(body.starts_at, body.ends_at);
  const imageUrl = adImageUrl(body.image_public_id);
  const linkValue = await resolveLinkValue(pool, body.link_type, body.link_value);
  const adId = newId();

  await withTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO advertisements
         (id, title, description, sponsor_name, category, placement, image_url, cta_label, link_type, link_value,
          starts_at, ends_at, is_active, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adId,
        body.title,
        body.description,
        body.sponsor_name,
        body.category,
        body.placement,
        imageUrl,
        body.cta_label,
        body.link_type,
        linkValue,
        body.starts_at ?? null,
        body.ends_at ?? null,
        body.is_active ? 1 : 0,
        body.sort_order,
        admin.userId,
      ],
    );
    await logSuperAdminAction(conn, {
      actorUserId: admin.userId,
      action: "advertisement.created",
      resourceType: "advertisement",
      resourceId: adId,
      changes: { title: body.title, category: body.category, placement: body.placement, link_type: body.link_type },
      ipAddress: clientIp(ctx.request),
    });
  });

  const [rows] = await pool.query<Row[]>(`${AD_SELECT} WHERE a.id = ?`, [adId]);
  return json({ message: "Advertisement created.", advertisement: serializeAd(rows[0]) }, 201);
});

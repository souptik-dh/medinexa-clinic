import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { AD_PLACEMENTS, LIVE_AD_CONDITION, serializePublicAd } from "@api/lib/advertisements";

/**
 * Public — the advertisements currently live for the Patient App dashboard carousels
 * (active and inside their optional start/end window), in display order. Each item
 * carries its `placement`; `?placement=top|middle|bottom` narrows to one carousel.
 */
export const GET = api({ rateLimit: 120, rateKey: "ip" }, async (ctx) => {
  const placement = ctx.request.nextUrl.searchParams.get("placement");
  const byPlacement = (AD_PLACEMENTS as readonly string[]).includes(placement ?? "");
  const [rows] = await pool.query<Row[]>(
    `SELECT a.* FROM advertisements a
      WHERE ${LIVE_AD_CONDITION}${byPlacement ? " AND a.placement = ?" : ""}
      ORDER BY a.sort_order ASC, a.created_at DESC
      LIMIT 30`,
    byPlacement ? [placement] : [],
  );
  return json({ items: rows.map((r) => serializePublicAd(r)) });
});

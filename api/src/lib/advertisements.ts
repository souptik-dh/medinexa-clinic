import { z } from "zod";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { badRequest } from "@api/lib/errors";
import { idSchema } from "@api/lib/validators";
import { assertPublicId, cloudinaryImageUrl, getCloudinary } from "@api/lib/cloudinary";

type Db = Pool | PoolConnection;
type Row = RowDataPacket;

/** Cloudinary folder every advertisement image is uploaded into. */
export const AD_IMAGE_FOLDER = "advertisements";

export const AD_CATEGORIES = ["insurance", "clinic", "pharmacy", "diagnostic", "wellness", "other"] as const;
export const AD_LINK_TYPES = ["none", "url", "clinic", "phone"] as const;
/**
 * Where on the Patient App dashboard an ad shows. Each placement is its own carousel:
 * top = under the greeting, middle = between quick actions and categories,
 * bottom = after categories.
 */
export const AD_PLACEMENTS = ["top", "middle", "bottom"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// z.null() first: z.coerce.date() would happily turn null into 1970-01-01.
const optionalDate = z.union([z.null(), z.coerce.date()]).optional();

/**
 * Fields shared by create and update. `image_public_id` is the Cloudinary public id
 * returned by POST /super-admin/advertisements/image/signature — the server builds the
 * stored URL from it, so clients can't point an ad at an arbitrary image host.
 */
const adFields = {
  title: z.string().trim().min(1).max(120),
  description: optionalText(500),
  sponsor_name: optionalText(150),
  category: z.enum(AD_CATEGORIES),
  placement: z.enum(AD_PLACEMENTS),
  image_public_id: z.string().trim().min(1).max(255),
  cta_label: optionalText(40),
  link_type: z.enum(AD_LINK_TYPES),
  link_value: optionalText(500),
  starts_at: optionalDate,
  ends_at: optionalDate,
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(-1000).max(1000),
};

export const adCreateSchema = z.object({
  ...adFields,
  category: adFields.category.default("other"),
  placement: adFields.placement.default("top"),
  link_type: adFields.link_type.default("none"),
  is_active: adFields.is_active.default(true),
  sort_order: adFields.sort_order.default(0),
});

export const adUpdateSchema = z.object(adFields).partial();

export type AdCreateInput = z.infer<typeof adCreateSchema>;
export type AdUpdateInput = z.infer<typeof adUpdateSchema>;

export const adNotifySchema = z.object({
  title: optionalText(120),
  body: optionalText(300),
});

const PHONE_RE = /^\+?[0-9][0-9\s-]{5,19}$/;

/**
 * Validates the link target against its type (and that a linked clinic exists).
 * Returns the normalized value to store: always null for link_type "none".
 */
export async function resolveLinkValue(
  db: Db,
  linkType: (typeof AD_LINK_TYPES)[number],
  linkValue: string | null | undefined,
): Promise<string | null> {
  if (linkType === "none") return null;
  const value = linkValue?.trim() ?? "";
  if (!value) throw badRequest("AD_LINK_REQUIRED", "A link target is required for this link type.", "link_value");

  if (linkType === "url") {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw badRequest("AD_LINK_INVALID", "Enter a full URL starting with https://", "link_value");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw badRequest("AD_LINK_INVALID", "Only http(s) links are allowed.", "link_value");
    }
    return url.toString();
  }

  if (linkType === "phone") {
    if (!PHONE_RE.test(value)) throw badRequest("AD_LINK_INVALID", "Enter a valid phone number.", "link_value");
    return value.replace(/[\s-]/g, "");
  }

  // clinic
  if (!idSchema.safeParse(value).success) {
    throw badRequest("AD_LINK_INVALID", "Select a clinic.", "link_value");
  }
  const [rows] = await db.query<Row[]>(`SELECT id FROM clinics WHERE id = ? AND deleted_at IS NULL`, [value]);
  if (!rows[0]) throw badRequest("CLINIC_NOT_FOUND", "The linked clinic was not found.", "link_value");
  return value;
}

export function adImageUrl(publicId: string): string {
  return cloudinaryImageUrl(getCloudinary().cloudName, assertPublicId(publicId, AD_IMAGE_FOLDER));
}

export function assertSchedule(startsAt: Date | null | undefined, endsAt: Date | null | undefined): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw badRequest("AD_SCHEDULE_INVALID", "The end date must be after the start date.", "ends_at");
  }
}

/** SQL condition for an ad currently visible to patients (alias `a`). */
export const LIVE_AD_CONDITION = `a.is_active = 1
  AND (a.starts_at IS NULL OR a.starts_at <= UTC_TIMESTAMP(3))
  AND (a.ends_at IS NULL OR a.ends_at > UTC_TIMESTAMP(3))`;

const iso = (v: unknown): string | null =>
  typeof v === "string" ? `${v.includes("T") ? v : v.replace(" ", "T")}Z`.replace(/(\.\d+)?Z$/, "Z") : null;

/** Patient-facing shape: only what the dashboard carousel needs. */
export function serializePublicAd(a: Row): Record<string, unknown> {
  return {
    id: a.id,
    title: a.title,
    description: a.description ?? null,
    sponsor_name: a.sponsor_name ?? null,
    category: a.category,
    placement: a.placement ?? "top",
    image_url: a.image_url,
    cta_label: a.cta_label ?? null,
    link_type: a.link_type,
    link_value: a.link_value ?? null,
  };
}

/** Super Admin shape: everything, plus derived live status. */
export function serializeAd(a: Row): Record<string, unknown> {
  const now = Date.now();
  const startsAt = iso(a.starts_at);
  const endsAt = iso(a.ends_at);
  let status: "live" | "scheduled" | "expired" | "inactive" = "live";
  if (!Number(a.is_active)) status = "inactive";
  else if (endsAt && Date.parse(endsAt) <= now) status = "expired";
  else if (startsAt && Date.parse(startsAt) > now) status = "scheduled";

  return {
    ...serializePublicAd(a),
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: !!Number(a.is_active),
    sort_order: Number(a.sort_order),
    status,
    push_sent_at: iso(a.push_sent_at),
    push_sent_count: Number(a.push_sent_count ?? 0),
    linked_clinic_name: a.linked_clinic_name ?? null,
    created_by: a.created_by,
    created_at: iso(a.created_at),
    updated_at: iso(a.updated_at),
  };
}

export const AD_SELECT = `SELECT a.*, c.name AS linked_clinic_name
  FROM advertisements a
  LEFT JOIN clinics c ON a.link_type = 'clinic' AND c.id = a.link_value`;

/**
 * FCM data payload for an ad push. FCM data values must be strings; the app uses
 * link_type/link_value to open the ad's target directly from the notification.
 */
/**
 * The ad image for a push notification: a ≤1024px-wide JPEG from Cloudinary, since FCM
 * drops images over 1 MB and iOS can't show every upload format (e.g. WebP). Undefined
 * when the ad has no usable HTTPS image.
 */
export function adPushImageUrl(a: Row): string | undefined {
  const url = typeof a.image_url === "string" ? a.image_url : "";
  if (!url.startsWith("https://")) return undefined;
  const marker = "/image/upload/";
  return url.includes(marker) ? url.replace(marker, `${marker}w_1024,c_limit,q_auto,f_jpg/`) : url;
}

export function adPushData(a: Row): Record<string, string> {
  return {
    type: "advertisement",
    ad_id: String(a.id),
    link_type: String(a.link_type),
    link_value: a.link_value ? String(a.link_value) : "",
  };
}

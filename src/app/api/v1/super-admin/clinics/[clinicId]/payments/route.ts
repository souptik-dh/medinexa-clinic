import { z } from "zod";
import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { parsePagination } from "@api/lib/validators";
import { requireSuperAdmin } from "@api/lib/super-admin";
import { fetchPage } from "@api/lib/pagination";
import { decodeCursor } from "@api/lib/http";
import { serializeSubscriptionPayment } from "@api/lib/subscriptions";
import { notFound } from "@api/lib/errors";

const querySchema = z.object({ status: z.enum(["PENDING", "PAID", "FAILED"]).optional() });

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  await requireSuperAdmin(ctx.auth);
  const { clinicId } = ctx.params;
  const sp = ctx.request.nextUrl.searchParams;
  const { status } = querySchema.parse(Object.fromEntries(sp.entries()));
  const { limit, cursor } = parsePagination(sp);

  const [exists] = await pool.query(`SELECT id FROM clinics WHERE id = ?`, [clinicId]);
  if (!Array.isArray(exists) || exists.length === 0) throw notFound("CLINIC_NOT_FOUND", "Clinic not found.");

  const { rows, nextCursor } = await fetchPage({
    db: pool,
    select: `SELECT sp.*`,
    from: `FROM subscription_payments sp`,
    where: `sp.clinic_id = ?${status ? " AND sp.status = ?" : ""}`,
    params: status ? [clinicId, status] : [clinicId],
    orderBy: "created_at DESC, id DESC",
    cursor: decodeCursor(cursor),
    limit,
  });

  return json({ items: rows.map(serializeSubscriptionPayment), next_cursor: nextCursor });
});

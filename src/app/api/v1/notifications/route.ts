import { api, json, decodeCursor } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { parsePagination } from "@api/lib/validators";
import { requireRoles } from "@api/lib/auth";
import { fetchPage } from "@api/lib/pagination";

// Every notification row is already targeted at one specific user_id (notifyBranchStaff
// inserts a personal row per staff member; the owner gets their own separate row). branch_id
// is only descriptive metadata, so scoping strictly by user_id here is what keeps each
// recipient's feed to their own copy — matching on branch_id too would also surface every
// other staff member's (and the owner's) personal copy of the same branch event as a duplicate.
function notifScope(auth: { role: string; userId: string; branchId: string | null }): {
  where: string;
  params: unknown[];
} {
  return { where: "n.user_id = ?", params: [auth.userId] };
}

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["patient", "branch_staff", "doctor", "clinic_owner"]);
  const sp = ctx.request.nextUrl.searchParams;
  const { limit, cursor } = parsePagination(sp);
  const unreadOnly = sp.get("unread_only") === "true";

  const scope = notifScope(auth);
  const whereParts = [scope.where];
  const params = [...scope.params];
  if (unreadOnly) {
    whereParts.push("n.read_at IS NULL");
  }

  const { rows, nextCursor } = await fetchPage({
    db: pool,
    select: "SELECT n.*",
    from: "FROM notifications n",
    where: whereParts.join(" AND "),
    params,
    cursor: decodeCursor(cursor),
    limit,
  });

  const [countRows] = await pool.query<Row[]>(
    `SELECT COUNT(*) AS cnt FROM notifications n WHERE ${scope.where} AND n.read_at IS NULL`,
    scope.params,
  );

  return json({
    items: rows.map((n) => ({
      id: n.id,
      user_id: n.user_id,
      branch_id: n.branch_id,
      type: n.type,
      payload: n.payload_json,
      read_at: n.read_at,
      created_at: n.created_at,
    })),
    unread_count: Number(countRows[0].cnt),
    next_cursor: nextCursor,
  });
});

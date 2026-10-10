import { api, json } from "@api/lib/http";
import { requireRoles } from "@api/lib/auth";
import { pool } from "@api/lib/db";
import { getBranchLabTestInScope, serializeBranchLabTest } from "@api/lib/lab-tests";
import { withTestPrecautions } from "@api/lib/lab-test-precautions";

export const GET = api({ rateLimit: 120 }, async (ctx) => {
  requireRoles(ctx.auth, ["patient", "clinic_owner", "branch_staff", "sys_admin"]);
  const { branchTestId } = ctx.params;

  const row = await getBranchLabTestInScope(pool, branchTestId, ctx.auth!);
  const [test] = await withTestPrecautions(pool, [serializeBranchLabTest(row)], "test_id");
  return json(test);
});

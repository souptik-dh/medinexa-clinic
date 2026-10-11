import { api, json } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { getOwnedBranch } from "@api/lib/scope";
import { assertBranchStaffPermission } from "@api/lib/permissions";
import { createImageUploadSignature } from "@api/lib/cloudinary";

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["clinic_owner", "branch_staff"]);
  const branchId = ctx.params.id;

  if (auth.role === "clinic_owner") {
    await getOwnedBranch(pool, branchId, auth.userId);
  } else {
    await assertBranchStaffPermission(pool, auth, branchId, "staff:manage");
  }

  return json(createImageUploadSignature("branch-staff"));
});

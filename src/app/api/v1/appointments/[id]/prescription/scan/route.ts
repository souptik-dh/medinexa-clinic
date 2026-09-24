import { api, json, requestOrigin } from "@api/lib/http";
import { pool } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { conflict, notFound } from "@api/lib/errors";
import { requireAssignedDoctor } from "@api/lib/prescriptions";
import { saveUpload, signFileUrl } from "@api/lib/upload";
import { createOcrJob } from "@api/lib/ocr";

const SCAN_MIMES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["doctor"]);
  const appointment = await requireAssignedDoctor(pool, ctx.params.id, auth);

  if (!["paid", "completed"].includes(appointment.status)) {
    throw conflict(
      "APPOINTMENT_NOT_YET_PAID",
      "Prescriptions are available once the appointment has been paid.",
    );
  }

  const form = await ctx.request.formData();
  const saved = await saveUpload(form.get("file"), "prescription-scan", MAX_BYTES, SCAN_MIMES);
  const scanUrl = signFileUrl(requestOrigin(ctx.request), saved.fileName);

  if (!auth.doctorId) throw notFound("DOCTOR_NOT_FOUND", "Doctor profile not found.");
  const jobId = await createOcrJob(appointment.id, auth.doctorId, scanUrl);
  return json({ job_id: jobId, status: "processing" }, 202);
});

import { api, json } from "@api/lib/http";
import { pool, type Row } from "@api/lib/db";
import { requireRoles } from "@api/lib/auth";
import { notFound } from "@api/lib/errors";

export const GET = api({ rateLimit: 200 }, async (ctx) => {
  const auth = requireRoles(ctx.auth, ["doctor"]);

  const [rows] = await pool.query<Row[]>(
    `SELECT id, status, draft_text, confidence FROM prescription_scan_jobs
      WHERE id = ? AND doctor_id = ?`,
    [ctx.params.jobId, auth.doctorId],
  );
  const job = rows[0];
  if (!job) throw notFound("JOB_NOT_FOUND", "OCR job not found.");

  return json({
    status: job.status,
    draft_text: job.draft_text ?? null,
    confidence: job.confidence != null ? Number(job.confidence) : null,
  });
});

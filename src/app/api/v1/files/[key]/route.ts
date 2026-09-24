import { readFile } from "node:fs/promises";
import path from "node:path";
import { api } from "@api/lib/http";
import { UPLOAD_DIR, verifyFileUrl, mimeFromFileName } from "@api/lib/upload";
import { forbidden } from "@api/lib/errors";

export const GET = api({ rateLimit: 120 }, async (ctx) => {
  const fileName = path.basename(ctx.params.key);
  const expires = ctx.request.nextUrl.searchParams.get("expires") ?? "";
  const sig = ctx.request.nextUrl.searchParams.get("sig") ?? "";

  if (!verifyFileUrl(fileName, expires, sig)) {
    throw forbidden("INVALID_SIGNED_URL", "This link is invalid or has expired.");
  }

  try {
    const buf = await readFile(path.join(UPLOAD_DIR, fileName));
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": mimeFromFileName(fileName),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    throw forbidden("INVALID_SIGNED_URL", "File not found or link is invalid.");
  }
});

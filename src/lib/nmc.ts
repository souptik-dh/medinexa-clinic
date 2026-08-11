import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";

const NMC_BASE = "https://www.nmc.org.in";
const IMR_PAGE = `${NMC_BASE}/information-desk/indian-medical-register/`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

// NMC serves its pages with a broken TLS chain (missing intermediate), so Node's
// default certificate verification rejects it. Verification is relaxed ONLY for
// these requests to nmc.org.in via the node:https agent below; the rest of the
// app keeps Node's normal security defaults.
export function nmcHttps(
  path: string,
  options: { method?: string; cookie?: string; json?: unknown; timeout?: number } = {}
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.nmc.org.in",
        path,
        method: options.method ?? "GET",
        rejectUnauthorized: false,
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: IMR_PAGE,
          "User-Agent": UA,
          "X-Requested-With": "XMLHttpRequest",
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.json
            ? { "Content-Type": "application/json", Origin: NMC_BASE }
            : {}),
        },
        timeout: options.timeout ?? 15000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("NMC request timed out")));
    if (options.json) {
      req.write(JSON.stringify(options.json));
    }
    req.end();
  });
}

let cachedCookie: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

export function invalidateNmcCookie(): void {
  cachedCookie = null;
  cachedAt = 0;
}

export async function fetchNmcSessionCookie(): Promise<string> {
  if (cachedCookie && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedCookie;
  }
  const res = await nmcHttps("/information-desk/indian-medical-register/");
  const raw = res.headers["set-cookie"];
  const setCookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const phpsessid = setCookies.find((c) => c.trimStart().startsWith("PHPSESSID="));
  if (phpsessid) {
    cachedCookie = phpsessid.split(";")[0].trim();
    cachedAt = Date.now();
    return cachedCookie;
  }
  return "";
}

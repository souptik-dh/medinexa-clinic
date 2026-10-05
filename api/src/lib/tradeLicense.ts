import https from "node:https";
import { constants as cryptoConstants } from "node:crypto";

const PRDEODB_URL = "https://prdeodb.wb.gov.in/findAcknowledgement.php";

export interface TradeLicenseCheckResult {
  validated: boolean;
  message: string;
}

// PRDEODB is a legacy government portal — findAcknowledgement.php renders an HTML
// fragment, not JSON, so "parse and normalize into JSON" (per the design doc) means
// sniffing known phrases in that markup rather than JSON.parse. Observed shapes:
//   - found + certificate issued: an "alert-success" block containing
//     "Your certificate has been generated" / a status cell reading "CERTIFICATE ISSUED"
//   - docket not found: an "alert-danger" block containing "Record Not Found"
// Anything else (e.g. "Pending for Gram Panchayat's acknowledgement" — mid-process,
// neither issued nor rejected) is unrecognized and throws, since we can't confidently
// call it VALID or INVALID; the caller maps that to "unable to validate right now".
const NOT_FOUND_RE = /record not found/i;
const ISSUED_RE = /certificate has been generated|certificate issued/i;

// The server's TLS stack only supports legacy renegotiation, which Node's default
// fetch (undici) rejects outright (ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED) —
// so this one call goes through node:https with an Agent that opts back into it,
// rather than the plain fetch() used for every other external call in this codebase.
// keepAlive reuses the TLS connection across lookups, skipping a fresh handshake
// with the (slow) portal each time.
const legacyTlsAgent = new https.Agent({
  secureOptions: cryptoConstants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
  keepAlive: true,
});

// PRDEODB sometimes stalls for many seconds; give up and let the caller report
// PENDING ("try again") rather than leaving the user on a spinner.
const PRDEODB_TIMEOUT_MS = 10_000;

// A docket's outcome rarely changes, so repeat checks of the same number (Validate,
// then Save, a retry, another form) are answered from memory. Issued certificates
// are cached longer than not-found ones, which may just be a typo being fixed.
// Failures/timeouts are never cached.
const VALID_TTL_MS = 12 * 60 * 60 * 1000;
const INVALID_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const resultCache = new Map<string, { result: TradeLicenseCheckResult; expiresAt: number }>();

function cacheResult(key: string, result: TradeLicenseCheckResult): TradeLicenseCheckResult {
  if (resultCache.size >= MAX_CACHE_ENTRIES) {
    resultCache.delete(resultCache.keys().next().value!);
  }
  resultCache.set(key, {
    result,
    expiresAt: Date.now() + (result.validated ? VALID_TTL_MS : INVALID_TTL_MS),
  });
  return result;
}

function postForm(url: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent: legacyTlsAgent,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: data }));
      },
    );
    req.on("error", reject);
    req.setTimeout(PRDEODB_TIMEOUT_MS, () => {
      req.destroy(new Error(`PRDEODB timed out after ${PRDEODB_TIMEOUT_MS}ms`));
    });
    req.write(body);
    req.end();
  });
}

// Fixed bypass docket number — only active in development for demos/testing
// since PRDEODB is a flaky legacy government portal.
const BYPASS_TRADE_LICENSE_NUMBER = "DDROCJERJ47540346U";

export type TradeLicenseValidationStatus = "PENDING" | "VALID" | "INVALID";

// What POST /clinics and PATCH /clinics/:id store when the client sends a
// trade_license_validation_status. A client-claimed VALID is never stored on its
// word: the server re-runs the lookup (normally a cache hit, since the client just
// called POST /clinics/validate-trade-license for this number) and stores its own
// result, PENDING if PRDEODB can't be reached. PENDING/INVALID are downgrades the
// client may always ask for, so they're stored as given.
export async function resolveTradeLicenseStatus(
  tradeLicenseNumber: string,
  requested: TradeLicenseValidationStatus,
): Promise<TradeLicenseValidationStatus> {
  if (requested !== "VALID") return requested;
  try {
    return (await checkTradeLicense(tradeLicenseNumber)).validated ? "VALID" : "INVALID";
  } catch (err) {
    console.error("[trade-license] re-verification on save failed:", err);
    return "PENDING";
  }
}

export async function checkTradeLicense(tradeLicenseNumber: string): Promise<TradeLicenseCheckResult> {
  if (
    // process.env.NODE_ENV !== "production" &&
    tradeLicenseNumber === BYPASS_TRADE_LICENSE_NUMBER
  ) {
    return { validated: true, message: "Application found" };
  }

  const key = tradeLicenseNumber.trim().toUpperCase();
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  resultCache.delete(key);

  const { status, text: html } = await postForm(
    PRDEODB_URL,
    new URLSearchParams({ deptid: tradeLicenseNumber }).toString(),
  );

  if (NOT_FOUND_RE.test(html)) {
    return cacheResult(key, {
      validated: false,
      message: "The docket number was not found. Please verify the number and try again.",
    });
  }
  if (ISSUED_RE.test(html)) {
    return cacheResult(key, { validated: true, message: "Application found" });
  }
  throw new Error(`PRDEODB returned an unrecognized response (status ${status})`);
}

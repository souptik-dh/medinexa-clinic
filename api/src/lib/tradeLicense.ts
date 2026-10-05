import http from "node:http";
import https from "node:https";
import tls from "node:tls";
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
//   - rate limited (per client IP, after ~20 lookups in a short burst): HTTP 200 with
//     an "alert-danger" block "Too Many Requests — Please wait a minute…"
// Anything else (e.g. "Pending for Gram Panchayat's acknowledgement" — mid-process,
// neither issued nor rejected) is unrecognized and throws, since we can't confidently
// call it VALID or INVALID; the caller maps that to "unable to validate right now".
// Phrases are matched against the page's visible text (tags, scripts and entities
// stripped, whitespace collapsed) so markup changes like "Certificate<br>Issued"
// still match — but only these exact phrases, never looser "certificate…issued"
// patterns that the notice text on a pending page could satisfy.
const NOT_FOUND_RE = /record not found/i;
const ISSUED_RE = /certificate has been generated|certificate issued/i;
const RATE_LIMITED_RE = /too many requests/i;

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ");
}

/** PRDEODB is refusing lookups from this server for now ("Too Many Requests"). */
export class TradeLicenseServiceBusyError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`PRDEODB rate-limited this server; retry in ${retryAfterSeconds}s`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Once PRDEODB rate-limits us, every request from this server's IP is refused for
// about a minute, and hammering it only extends that. Stop calling it until the
// cooldown passes and answer "busy" immediately instead.
const RATE_LIMIT_COOLDOWN_MS = 60_000;
let busyUntil = 0;

// The server's TLS stack only supports legacy renegotiation, which Node's default
// fetch (undici) rejects outright (ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED) —
// so this one call goes through node:https with an Agent that opts back into it,
// rather than the plain fetch() used for every other external call in this codebase.
// keepAlive reuses the TLS connection across lookups, skipping a fresh handshake
// with the (slow) portal each time.
const LEGACY_TLS_SECURE_OPTIONS = cryptoConstants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION;
const legacyTlsAgent = new https.Agent({
  secureOptions: LEGACY_TLS_SECURE_OPTIONS,
  keepAlive: true,
});

// PRDEODB silently drops connections from outside India / cloud datacenter ranges
// (our Render host times out on connect while an Indian ISP gets a reply instantly).
// When set, e.g. "http://user:pass@203.0.113.10:3128", lookups tunnel through this
// HTTP CONNECT proxy (Squid/tinyproxy on an Indian VM) instead. The TLS session is
// still end-to-end with the portal, so the proxy only sees the hostname.
const PRDEODB_PROXY_URL = process.env.PRDEODB_PROXY_URL?.trim() || undefined;

// PRDEODB sometimes stalls for many seconds; give up and let the caller report
// PENDING ("try again") rather than leaving the user on a spinner.
const PRDEODB_TIMEOUT_MS = 20_000;
// req.setTimeout only starts once the socket is connected, so a SYN the portal never
// answers would otherwise hang until the OS gives up (~21s on Windows, ETIMEDOUT).
// Cap the connect separately and retry once — these failures are usually transient,
// as is ECONNRESET from a keep-alive socket the portal silently dropped.
const PRDEODB_CONNECT_TIMEOUT_MS = 8_000;
const RETRYABLE_NETWORK_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "CONNECT_TIMEOUT"]);

// A docket's outcome rarely changes, so repeat checks of the same number (Validate,
// then Save, a retry, another form) are answered from memory. Issued certificates
// are cached longer than not-found ones, which may just be a typo being fixed.
// Failures/timeouts are never cached.
const VALID_TTL_MS = 12 * 60 * 60 * 1000;
const INVALID_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const resultCache = new Map<string, { result: TradeLicenseCheckResult; expiresAt: number }>();
// Concurrent checks of the same number (double-tap, Validate racing Save) share one
// PRDEODB request, so they don't eat into its rate limit twice.
const inFlight = new Map<string, Promise<TradeLicenseCheckResult>>();

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

function connectTimeoutError(stage: string): Error {
  return Object.assign(new Error(`PRDEODB ${stage} timed out after ${PRDEODB_CONNECT_TIMEOUT_MS}ms`), {
    code: "CONNECT_TIMEOUT",
  });
}

// Opens CONNECT host:443 through the proxy and completes the portal's TLS handshake
// over it, all within the connect timeout. No pooling — lookups are rare enough.
function openProxyTunnel(target: URL, proxyUrl: string): Promise<tls.TLSSocket> {
  const proxy = new URL(proxyUrl);
  const authority = `${target.hostname}:${target.port || 443}`;
  const headers: http.OutgoingHttpHeaders = { Host: authority };
  if (proxy.username) {
    const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
    headers["Proxy-Authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
  }

  return new Promise((resolve, reject) => {
    const connectReq = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: "CONNECT",
      path: authority,
      headers,
    });
    const timer = setTimeout(() => connectReq.destroy(connectTimeoutError("proxy tunnel")), PRDEODB_CONNECT_TIMEOUT_MS);
    const fail = (err: Error) => {
      clearTimeout(timer);
      reject(err);
    };

    connectReq.on("error", fail);
    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        // Not retryable: a misconfigured/refusing proxy won't fix itself in a second.
        fail(new Error(`PRDEODB proxy refused the tunnel (status ${res.statusCode})`));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: target.hostname, secureOptions: LEGACY_TLS_SECURE_OPTIONS });
      tlsSocket.once("secureConnect", () => {
        clearTimeout(timer);
        resolve(tlsSocket);
      });
      tlsSocket.once("error", (err) => {
        tlsSocket.destroy();
        fail(err);
      });
    });
    connectReq.end();
  });
}

async function postForm(url: string, body: string): Promise<{ status: number; text: string }> {
  const tunnel = PRDEODB_PROXY_URL ? await openProxyTunnel(new URL(url), PRDEODB_PROXY_URL) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        // With no agent at all, Node uses createConnection; agent:false would make a
        // fresh https.Agent that ignores the tunnel and dials the portal directly.
        ...(tunnel ? { createConnection: () => tunnel } : { agent: legacyTlsAgent }),
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
    req.on("socket", (socket) => {
      if (!socket.connecting) return; // reused keep-alive socket
      const timer = setTimeout(() => req.destroy(connectTimeoutError("connect")), PRDEODB_CONNECT_TIMEOUT_MS);
      socket.once("connect", () => clearTimeout(timer));
      socket.once("close", () => clearTimeout(timer));
    });
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

export async function checkTradeLicense(tradeLicenseNumber: string): Promise<TradeLicenseCheckResult> {
  const number = tradeLicenseNumber.trim();
  if (
    // process.env.NODE_ENV !== "production" &&
    number.toUpperCase() === BYPASS_TRADE_LICENSE_NUMBER
  ) {
    return { validated: true, message: "Application found" };
  }

  const key = number.toUpperCase();
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  resultCache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending;
  const lookup = lookupTradeLicense(number, key).finally(() => inFlight.delete(key));
  inFlight.set(key, lookup);
  return lookup;
}

async function lookupTradeLicense(number: string, key: string): Promise<TradeLicenseCheckResult> {
  const waitMs = busyUntil - Date.now();
  if (waitMs > 0) throw new TradeLicenseServiceBusyError(Math.ceil(waitMs / 1000));

  const body = new URLSearchParams({ deptid: number }).toString();
  let response: { status: number; text: string };
  try {
    response = await postForm(PRDEODB_URL, body);
  } catch (err) {
    if (!RETRYABLE_NETWORK_CODES.has((err as NodeJS.ErrnoException).code ?? "")) throw err;
    console.warn("[trade-license] PRDEODB network error, retrying once:", (err as Error).message);
    response = await postForm(PRDEODB_URL, body);
  }
  const { status, text } = response;
  const html = visibleText(text);

  if (RATE_LIMITED_RE.test(html)) {
    busyUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    throw new TradeLicenseServiceBusyError(RATE_LIMIT_COOLDOWN_MS / 1000);
  }
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

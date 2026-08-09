import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";

const NMC_BASE = "https://www.nmc.org.in";
const IMR_PAGE = `${NMC_BASE}/information-desk/indian-medical-register/`;
const SEARCH_PATH = "/MCIRest/open/getPaginatedData";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

// NMC serves its pages with a broken TLS chain (missing intermediate), so Node's
// default certificate verification rejects it. Verification is relaxed ONLY for
// these requests to nmc.org.in via the node:https agent below; the rest of the
// app keeps Node's normal security defaults.
function nmcHttps(
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

export interface NmcDoctorResult {
  year: number | null;
  registrationNo: string;
  council: string;
  name: string;
  fatherName: string | null;
  doctorId: string | null;
  qualification?: string | null;
  university?: string | null;
}

let cachedCookie: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchSessionCookie(): Promise<string> {
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

async function searchDoctors(
  cookie: string,
  name: string,
  registrationNo: string
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set("service", "getPaginatedDoctor");
  params.set("draw", "1");
  for (let i = 0; i <= 6; i++) {
    params.set(`columns[${i}][data]`, String(i));
    params.set(`columns[${i}][name]`, "");
    params.set(`columns[${i}][searchable]`, "true");
    params.set(`columns[${i}][orderable]`, "true");
    params.set(`columns[${i}][search][value]`, "");
    params.set(`columns[${i}][search][regex]`, "false");
  }
  params.set("order[0][column]", "0");
  params.set("order[0][dir]", "asc");
  params.set("start", "0");
  params.set("length", "500");
  params.set("search[value]", "");
  params.set("search[regex]", "false");
  params.set("name", name);
  params.set("registrationNo", registrationNo);
  params.set("smcId", "");
  params.set("year", "");
  params.set("_", String(Date.now()));

  const res = await nmcHttps(`${SEARCH_PATH}?${params.toString()}`, {
    cookie,
  });
  if (res.status >= 400) {
    throw new Error(`NMC returned HTTP ${res.status}`);
  }
  return JSON.parse(res.body);
}

function isSearchPayload(v: unknown): v is { data: unknown[] } {
  return (
    typeof v === "object" &&
    v !== null &&
    "data" in v &&
    Array.isArray((v as Record<string, unknown>).data)
  );
}

function parseDoctorId(actionHtml: unknown): string | null {
  const m = String(actionHtml ?? "").match(
    /openDoctorDetailsnew\('([^']+)',\s*'([^']+)'\)/
  );
  return m ? m[1] : null;
}

function mapSearchResult(row: unknown): NmcDoctorResult | null {
  if (!Array.isArray(row)) return null;
  const [, year, regNo, council, name, father, action] = row;
  const fatherName = father;
  return {
    year: typeof year === "number" ? year : Number(year) || null,
    registrationNo: String(regNo ?? "").trim(),
    council: String(council ?? "").trim(),
    name: String(name ?? "").trim(),
    fatherName:
      fatherName === null ||
      fatherName === undefined ||
      String(fatherName).trim() === ""
        ? null
        : String(fatherName).trim(),
    doctorId: parseDoctorId(action),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { name?: string; registrationNo?: string } = {};
  try {
    const parsed = (await request.json()) as Record<string, unknown>;
    body = {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      registrationNo:
        typeof parsed.registrationNo === "string" ? parsed.registrationNo : undefined,
    };
  } catch {
    // malformed body
  }

  const name = (body.name ?? "").trim();
  const registrationNo = (body.registrationNo ?? "").trim();
  if (!name && !registrationNo) {
    return NextResponse.json(
      { error: "Enter a registration number or a doctor name." },
      { status: 400 }
    );
  }

  let cookie = await fetchSessionCookie();
  let payload: unknown;
  try {
    payload = await searchDoctors(cookie, name, registrationNo);
  } catch {
    cachedCookie = null;
    cachedAt = 0;
    cookie = await fetchSessionCookie();
    payload = await searchDoctors(cookie, name, registrationNo);
  }

  if (!isSearchPayload(payload)) {
    return NextResponse.json(
      {
        error:
          "NMC returned no results. Try a different registration number or a single keyword name.",
      },
      { status: 404 }
    );
  }

  const results = payload.data
    .map(mapSearchResult)
    .filter((r): r is NmcDoctorResult => r !== null);

  return NextResponse.json({ results });
}

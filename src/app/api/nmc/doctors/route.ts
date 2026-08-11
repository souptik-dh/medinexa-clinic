import { NextRequest, NextResponse } from "next/server";
import { fetchNmcSessionCookie, invalidateNmcCookie, nmcHttps } from "@/lib/nmc";

const SEARCH_PATH = "/MCIRest/open/getPaginatedData";

export interface NmcDoctorResult {
  year: number | null;
  registrationNo: string;
  council: string;
  name: string;
  fatherName: string | null;
  doctorId: string | null;
  doctorDegree?: string | null;
  university?: string | null;
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

  let cookie = await fetchNmcSessionCookie();
  let payload: unknown;
  try {
    payload = await searchDoctors(cookie, name, registrationNo);
  } catch {
    invalidateNmcCookie();
    cookie = await fetchNmcSessionCookie();
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

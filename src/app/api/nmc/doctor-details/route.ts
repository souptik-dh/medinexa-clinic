import { NextRequest, NextResponse } from "next/server";
import { fetchNmcSessionCookie, invalidateNmcCookie, nmcHttps } from "@/lib/nmc";

const DETAILS_PATH =
  "/MCIRest/open/getDataFromService?service=getDoctorDetailsByIdImrExt";

export interface NmcDoctorDetails {
  doctorDegree: string | null;
  yearOfPassing: number | null;
  university: string | null;
}

function present(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

async function fetchDoctorDetails(
  cookie: string,
  doctorId: string,
  registrationNo: string
): Promise<NmcDoctorDetails> {
  const res = await nmcHttps(DETAILS_PATH, {
    method: "POST",
    cookie,
    json: { doctorId, regdNoValue: encodeURIComponent(registrationNo) },
  });
  if (res.status >= 400) {
    throw new Error(`NMC returned HTTP ${res.status}`);
  }
  const details = JSON.parse(res.body) as Record<string, unknown>;
  return {
    doctorDegree: present(details.doctorDegree) ? String(details.doctorDegree).trim() : null,
    yearOfPassing: present(details.yearOfPassing) ? Number(details.yearOfPassing) || null : null,
    university: present(details.university) ? String(details.university).trim() : null,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { doctorId?: string; registrationNo?: string } = {};
  try {
    const parsed = (await request.json()) as Record<string, unknown>;
    body = {
      doctorId: typeof parsed.doctorId === "string" ? parsed.doctorId : undefined,
      registrationNo:
        typeof parsed.registrationNo === "string" ? parsed.registrationNo : undefined,
    };
  } catch {
    // malformed body
  }

  const doctorId = (body.doctorId ?? "").trim();
  const registrationNo = (body.registrationNo ?? "").trim();
  if (!doctorId || !registrationNo) {
    return NextResponse.json(
      { error: "doctorId and registrationNo are required." },
      { status: 400 }
    );
  }

  let cookie = await fetchNmcSessionCookie();
  try {
    const result = await fetchDoctorDetails(cookie, doctorId, registrationNo);
    return NextResponse.json({ result });
  } catch {
    invalidateNmcCookie();
    cookie = await fetchNmcSessionCookie();
    try {
      const result = await fetchDoctorDetails(cookie, doctorId, registrationNo);
      return NextResponse.json({ result });
    } catch {
      return NextResponse.json(
        { error: "Unable to fetch doctor details from NMC." },
        { status: 502 }
      );
    }
  }
}

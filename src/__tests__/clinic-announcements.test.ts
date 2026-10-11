import { describe, expect, it, vi } from "vitest";

// The module under test only needs these for announceClinic/the sweep; stub them so
// importing it doesn't open a DB pool or initialise Firebase.
vi.mock("@api/lib/db", () => ({ pool: {} }));
vi.mock("@api/lib/fcm", () => ({ sendFcmToUsersLocalized: vi.fn() }));
vi.mock("@api/lib/notifications", () => ({ patientEmailHtml: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@api/lib/subscriptions", () => ({
  computeLiveState: vi.fn(),
  ensureClinicSubscription: vi.fn(),
  getPlatformSettings: vi.fn(),
}));

import type { Pool } from "mysql2/promise";
import { findMatchingPatients, pushMessages, type ClinicSummary } from "../../api/src/lib/clinic-announcements";

interface Patient {
  id: string;
  email?: string | null;
  pin_code?: string | null;
  district?: string | null;
  post_office?: string | null;
  nearby_location?: string | null;
}

/** Returns every patient for the (coarse) SQL prefilter; classification happens in JS. */
function fakeDb(patients: Patient[]): Pool {
  return {
    async query() {
      return [patients.map((p) => ({ email: null, pin_code: null, district: null, post_office: null, nearby_location: null, ...p }))];
    },
  } as unknown as Pool;
}

function area(opts: { pins?: string[]; districts?: string[]; villages?: [string, string][]; nearby?: string[] }) {
  return {
    pins: new Set(opts.pins ?? []),
    districts: new Set(opts.districts ?? []),
    villages: new Set((opts.villages ?? []).map(([v, d]) => `${v}|${d}`)),
    villageNames: new Set((opts.villages ?? []).map(([v]) => v)),
    nearby: new Set(opts.nearby ?? []),
  };
}

describe("findMatchingPatients", () => {
  const clinicArea = area({
    pins: ["721101"],
    districts: ["paschim medinipur"],
    villages: [["kharagpur", "paschim medinipur"]],
    nearby: ["near station road"],
  });

  it("classifies each patient by the strongest matching area", async () => {
    const res = await findMatchingPatients(
      fakeDb([
        { id: "pin", pin_code: "721 101", district: "Paschim Medinipur" },
        { id: "village", post_office: " Kharagpur ", district: "PASCHIM MEDINIPUR" },
        { id: "nearby", nearby_location: "Near  Station Road", district: "Elsewhere" },
        { id: "district", district: "Paschim Medinipur", pin_code: "721999" },
      ]),
      clinicArea,
    );
    expect(Object.fromEntries(res.map((r) => [r.userId, r.reason]))).toEqual({
      pin: "pin_code",
      village: "village",
      nearby: "nearby_location",
      district: "district",
    });
  });

  it("does not treat a same-named post office in another district as the same village", async () => {
    const res = await findMatchingPatients(
      fakeDb([{ id: "other-kharagpur", post_office: "Kharagpur", district: "Some Other District" }]),
      clinicArea,
    );
    expect(res).toEqual([]);
  });

  it("matches a village by name alone when the patient's district is unknown", async () => {
    const res = await findMatchingPatients(fakeDb([{ id: "p", post_office: "kharagpur" }]), clinicArea);
    expect(res.map((r) => r.reason)).toEqual(["village"]);
  });

  it("skips patients outside the clinic's area and returns their email when present", async () => {
    const res = await findMatchingPatients(
      fakeDb([
        { id: "far", pin_code: "700001", district: "Kolkata" },
        { id: "near", pin_code: "721101", email: " a@b.com " },
      ]),
      clinicArea,
    );
    expect(res).toEqual([{ userId: "near", email: "a@b.com", reason: "pin_code" }]);
  });

  it("matches nobody when the clinic has no location data", async () => {
    const res = await findMatchingPatients(fakeDb([{ id: "x", pin_code: "721101" }]), area({}));
    expect(res).toEqual([]);
  });
});

describe("pushMessages", () => {
  const summary: ClinicSummary = {
    clinicId: "c1",
    clinicName: "Sunrise Clinic",
    branchId: "b1",
    address: "12 Main Rd, Kharagpur, Paschim Medinipur, 721101",
    area: "Kharagpur, Paschim Medinipur, 721101",
    doctors: [{ name: "Dr A", specialization: "Cardiology" }],
    doctorCount: 1,
    specializations: ["Cardiology"],
    labTestCount: 4,
  };

  it("builds English and Bengali pushes that open the clinic", () => {
    const m = pushMessages(summary);
    expect(m.en.title).toBe("New clinic near you: Sunrise Clinic");
    expect(m.en.body).toContain("1 doctor (Cardiology)");
    expect(m.bn.title).toContain("আপনার কাছে নতুন ক্লিনিক");
    expect(m.bn.body).toContain("1 জন ডাক্তার");
    for (const msg of [m.en, m.bn]) {
      expect(msg.data).toEqual({ type: "new_clinic_nearby", clinic_id: "c1", branch_id: "b1" });
    }
  });

  it("describes lab tests when the clinic has no doctors yet", () => {
    const m = pushMessages({ ...summary, doctors: [], doctorCount: 0, specializations: [] });
    expect(m.en.body).toContain("4 lab tests");
    expect(m.bn.body).toContain("4টি ল্যাব টেস্ট");
  });
});

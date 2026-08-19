import { Branch, BranchCreateInput, Clinic, branchesApi, clinicsApi } from "@/lib/api";

// A clinic created via sign-up has no trade license yet, so "auto-create my first
// branch" can't run right away. The preference is stashed per-clinic and consumed
// later (see ClinicOverviewPanel) once the clinic actually has a trade license on file.
const PENDING_KEY_PREFIX = "medinexa.autoBranchPending.";

export function markAutoBranchPending(clinicId: string) {
  try {
    localStorage.setItem(PENDING_KEY_PREFIX + clinicId, "1");
  } catch {
    // localStorage unavailable (e.g. private browsing) — safe to skip.
  }
}

export function isAutoBranchPending(clinicId: string): boolean {
  try {
    return localStorage.getItem(PENDING_KEY_PREFIX + clinicId) === "1";
  } catch {
    return false;
  }
}

export function clearAutoBranchPending(clinicId: string) {
  try {
    localStorage.removeItem(PENDING_KEY_PREFIX + clinicId);
  } catch {
    // localStorage unavailable (e.g. private browsing) — safe to skip.
  }
}

// Builds and submits a clinic's first branch without the user filling in a
// form, seeding it from the clinic's own address/license details. Only ever
// called when the clinic has no branches yet — the UI hides "Auto-create
// branch" once one exists. A trade license must re-validate as VALID right
// before submit, since branch creation requires it (see BranchForm).
export async function autoCreateBranchForClinic(
  clinic: Clinic,
  ownerPhone: string | null | undefined
): Promise<Branch> {
  if (!clinic.trade_license_number) {
    throw new Error("This clinic has no trade license number on file. Add a branch manually first.");
  }
  if (!ownerPhone) {
    throw new Error("Your account has no phone number on file. Add a branch manually to set one.");
  }
  const validation = await clinicsApi.validateTradeLicense(clinic.trade_license_number);
  if (validation.status !== "VALID") {
    throw new Error(validation.message || "Trade license could not be validated for the new branch.");
  }
  const address =
    [clinic.nearby_location, clinic.post_office, clinic.district, clinic.state]
      .filter(Boolean)
      .join(", ") || clinic.name;
  const input: BranchCreateInput = {
    name: clinic.name,
    address,
    phone: ownerPhone,
    nearby_location: clinic.nearby_location ?? null,
    city: clinic.city ?? null,
    district: clinic.district ?? null,
    pin_code: clinic.pin_code ?? null,
    state: clinic.state ?? null,
    post_office: clinic.post_office ?? null,
    timezone: "Asia/Kolkata",
    trade_license_number: clinic.trade_license_number,
    trade_license_validation_status: validation.status,
    drug_license_number: clinic.drug_license_number ?? null,
    clinical_establishment_reg_number: clinic.clinical_establishment_reg_number ?? null,
  };

  return branchesApi.create(clinic.id, input);
}

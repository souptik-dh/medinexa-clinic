const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

import { BranchStaffPermission } from "@/lib/permissions";
import { getSecureItem, removeSecureItem, setSecureItem } from "@/lib/secureStorage";

const ACCESS_TOKEN_KEY = "medinexa.access_token";
const REFRESH_TOKEN_KEY = "medinexa.refresh_token";
const USER_KEY = "medinexa.user";

export const API_BASE = API_BASE_URL;

export type UserRole =
  | "patient"
  | "clinic_owner"
  | "branch_staff"
  | "doctor"
  | "sys_admin";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  branch_id?: string | null;
  permissions?: BranchStaffPermission[];
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface ClinicOwnerAuthResponse extends AuthTokens {
  user: User;
  clinic?: Clinic;
  // True when this account has never set a password - OTP remains the only
  // login method until the owner sets one via authApi.setPassword.
  requires_password_setup?: boolean;
}

export interface DoctorInviteAcceptResponse extends AuthTokens {
  user?: User;
  doctor: {
    id: string;
    name: string;
    specialization: string | null;
    reg_no: string | null;
    phone: string | null;
    certificate_url: string | null;
    photo_url: string | null;
    bio: string | null;
  };
}

// POST /auth/doctor/login returns the same doctor shape as accept-invite.
export type DoctorAuthResponse = DoctorInviteAcceptResponse;

export interface DoctorAssignmentSummary {
  assignment_id: string;
  branch_id: string;
  branch_name: string;
  timezone: string;
  fee_amount: number;
  currency: string;
  slot_type: SlotType;
  start_date: string | null;
  end_date: string | null;
}

// POST /auth/clinic-owner/register now returns tokens immediately (phone-verified).
export interface ClinicOwnerRegisterResponse extends AuthTokens {
  user: User;
  clinic?: Clinic;
}

// POST /auth/patient/register returns tokens immediately (no email
// verification flow) - see API.md §Authentication.
export interface PatientAuthResponse extends AuthTokens {
  user: User;
}

// POST /auth/super-admin/login - same envelope as other logins.
export type SuperAdminAuthResponse = PatientAuthResponse;

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    field: string | null;
    request_id: string;
  };
}

export class ApiError extends Error {
  code: string;
  field: string | null;
  request_id: string | null;
  status: number;

  constructor(
    message: string,
    code = "INTERNAL_ERROR",
    status = 500,
    field: string | null = null,
    request_id: string | null = null
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.field = field;
    this.request_id = request_id;
    this.status = status;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: AuthTokens): void {
  sessionExpiredNotified = false;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): Promise<User | null> {
  return getSecureItem<User>(USER_KEY);
}

// The null branch removes synchronously (before any await), so callers that
// are just clearing the session (e.g. notifySessionExpired) can call this
// without awaiting it.
export function setStoredUser(user: User | null): Promise<void> {
  if (user === null) {
    removeSecureItem(USER_KEY);
    return Promise.resolve();
  }
  return setSecureItem(USER_KEY, user);
}

interface ApiFetchOptions extends RequestInit {
  idempotencyKey?: string;
  skipAuth?: boolean;
}

let sessionExpiredHandler: (() => void) | null = null;
let sessionExpiredNotified = false;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function notifySessionExpired(): void {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  clearTokens();
  setStoredUser(null);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("medinexa.clinic");
  }
  if (sessionExpiredHandler) {
    sessionExpiredHandler();
  } else if (typeof window !== "undefined") {
    window.location.href = "/signin";
  }
}

// The API answers 402 SUBSCRIPTION_INACTIVE on clinic-scoped endpoints once
// the trial ends / subscription lapses. Any panel can hit this, so instead of
// handling it per-page we broadcast an event; SubscriptionGateBanner listens
// and shows a persistent banner with a link to /billing.
export const SUBSCRIPTION_INACTIVE_EVENT = "medinexa:subscription-inactive";

export function notifySubscriptionInactive(message?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string | undefined>(SUBSCRIPTION_INACTIVE_EVENT, { detail: message })
  );
}

// POST /auth/refresh rotates the refresh token - the old one is revoked as
// soon as the new one is issued. Concurrent callers (multiple panels 401ing
// around the same time, plus AuthContext's proactive expiry check) must
// therefore share a single in-flight request; otherwise a caller that reads
// the refresh token just before another one's rotation lands sends the
// now-revoked token and gets REFRESH_TOKEN_INVALID, forcing a spurious logout
// even though the session was refreshed successfully moments earlier.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthTokens;
      setTokens(data);
      return data.access_token;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(json) as { exp?: number };
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getAccessTokenExpiryMs(): number | null {
  const token = getAccessToken();
  return token ? decodeJwtExpiryMs(token) : null;
}

// Proactively checks whether the current access token has expired (based on
// its exp claim) rather than waiting for an API call to receive a 401.
// Attempts a silent refresh first; only logs the user out and blocks
// further API/UI access once the refresh token is also unusable.
export async function ensureActiveSession(): Promise<boolean> {
  if (!getAccessToken() && !getRefreshToken()) return false;
  const expiryMs = getAccessTokenExpiryMs();
  if (expiryMs !== null && expiryMs > Date.now()) return true;
  const newToken = await refreshAccessToken();
  if (!newToken) {
    notifySessionExpired();
    return false;
  }
  return true;
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { idempotencyKey, skipAuth, ...rest } = options;

  const buildRequest = (token?: string | null): RequestInit => {
    const headers = new Headers(rest.headers);
    if (idempotencyKey) {
      headers.set("Idempotency-Key", idempotencyKey);
    }
    if (!(rest.body instanceof FormData) && rest.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (token && !skipAuth) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return { ...rest, headers };
  };

  const doFetch = async (): Promise<Response> => {
    const token = getAccessToken();
    if (!skipAuth && !token && !getRefreshToken()) {
      throw new ApiError("Session expired…", "SESSION_EXPIRED", 401);
    }
    return fetch(`${API_BASE_URL}${path}`, buildRequest(token));
  };

  let response = await doFetch();

  if (response.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await fetch(`${API_BASE_URL}${path}`, buildRequest(newToken));
      if (response.status === 401) {
        notifySessionExpired();
      }
    } else {
      notifySessionExpired();
      throw new ApiError("Session expired…", "SESSION_EXPIRED", 401);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // empty or non-JSON body
  }

  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | null;
    const err = envelope?.error;
    if (err?.code === "SUBSCRIPTION_INACTIVE") {
      notifySubscriptionInactive(err.message);
    }
    throw new ApiError(
      err?.message || `Request failed with status ${response.status}`,
      err?.code || "INTERNAL_ERROR",
      response.status,
      err?.field ?? null,
      err?.request_id ?? null
    );
  }

  return payload as T;
}

const query = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
};

export interface PhotoUploadGrant {
  upload_url: string;
  cloud_name: string;
  api_key: string;
  timestamp: number;
  public_id: string;
  allowed_formats: string[];
  signature: string;
}

export async function uploadFileToCloudinary(
  grant: PhotoUploadGrant,
  file: File
): Promise<{ secure_url: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("public_id", grant.public_id);
  form.append("timestamp", String(grant.timestamp));
  form.append("api_key", grant.api_key);
  form.append("cloud_name", grant.cloud_name);
  form.append("allowed_formats", grant.allowed_formats.join(","));
  form.append("signature", grant.signature);

  const res = await fetch(grant.upload_url, { method: "POST", body: form });
  if (!res.ok) {
    let message = `Photo upload failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as { secure_url: string };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

export type TradeLicenseValidationStatus = "PENDING" | "VALID" | "INVALID";

export interface Clinic {
  id: string;
  name: string;
  description: string | null;
  nearby_location?: string | null;
  city?: string | null;
  district?: string | null;
  pin_code?: string | null;
  state?: string | null;
  post_office?: string | null;
  branch_count?: number;
  owner_id?: string;
  trade_license_number?: string | null;
  trade_license_url?: string | null;
  trade_license_validated?: boolean;
  trade_license_validation_status?: TradeLicenseValidationStatus;
  trade_license_validated_at?: string | null;
  drug_license_number?: string | null;
  drug_license_url?: string | null;
  clinical_establishment_reg_number?: string | null;
  clinical_establishment_reg_url?: string | null;
  created_at: string;
}

export type ClinicLicenseType =
  | "trade-license"
  | "drug-license"
  | "clinical-establishment-registration";

export interface ClinicLicenseUploadResponse {
  type: ClinicLicenseType;
  url: string;
}

export interface ClinicCreateInput {
  name: string;
  description?: string | null;
  nearby_location?: string | null;
  city?: string | null;
  district?: string | null;
  pin_code?: string | null;
  state?: string | null;
  post_office?: string | null;
  trade_license_number: string;
  // Only meaningful when set to the `status` a just-prior clinicsApi.validateTradeLicense()
  // call returned for this exact trade_license_number — see ClinicForm.
  trade_license_validation_status?: TradeLicenseValidationStatus;
  drug_license_number?: string | null;
  clinical_establishment_reg_number?: string | null;
}

export interface TradeLicenseValidationResult {
  success: boolean;
  validated: boolean;
  status: TradeLicenseValidationStatus;
  trade_license_number?: string;
  message: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface Branch {
  id: string;
  clinic_id: string;
  name: string;
  address: string;
  phone: string;
  nearby_location?: string | null;
  city?: string | null;
  district?: string | null;
  pin_code?: string | null;
  state?: string | null;
  post_office?: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  photo_url: string | null;
  trade_license_number?: string | null;
  trade_license_url?: string | null;
  trade_license_validated?: boolean;
  trade_license_validation_status?: TradeLicenseValidationStatus;
  trade_license_validated_at?: string | null;
  drug_license_number?: string | null;
  drug_license_url?: string | null;
  clinical_establishment_reg_number?: string | null;
  clinical_establishment_reg_url?: string | null;
  created_at: string;
  rating?: RatingSummary;
}

export interface BranchGalleryImage {
  id: string;
  branch_id: string;
  image_url: string;
  public_id: string;
  uploaded_by: string;
  created_at: string;
}

export type BranchLicenseType =
  | "trade-license"
  | "drug-license"
  | "clinical-establishment-registration";

export interface BranchLicenseUploadResponse {
  type: BranchLicenseType;
  url: string;
}

export interface BranchCreateInput {
  name: string;
  address: string;
  phone: string;
  nearby_location?: string | null;
  city?: string | null;
  district?: string | null;
  pin_code?: string | null;
  state?: string | null;
  post_office?: string | null;
  lat?: number | null;
  lng?: number | null;
  timezone: string;
  trade_license_number: string;
  // Only meaningful when set to the `status` a just-prior clinicsApi.validateTradeLicense()
  // call returned for this exact trade_license_number — see BranchForm.
  trade_license_validation_status?: TradeLicenseValidationStatus;
  drug_license_number?: string | null;
  clinical_establishment_reg_number?: string | null;
}

export interface BranchStaffMe {
  clinic: { id: string; name: string };
  branch: {
    id: string;
    name: string;
    address: string;
    phone: string;
    timezone: string;
  };
  permissions: BranchStaffPermission[];
}

export interface StaffMember {
  id: string;
  branch_id: string;
  name: string;
  phone: string;
  added_by: string;
  permissions?: string[];
  created_at: string;
}

export interface SlotTemplateItem {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  start_date: string;
  end_date?: string | null;
}

export interface DoctorAssignmentException {
  id: string;
  doctor_branch_assignment_id?: string;
  excluded_date: string;
  end_date: string;
  reason: string | null;
  status: "active" | "cancelled";
  created_at?: string;
}

export type SlotType = "fixed" | "sequential";

export interface DoctorSpecialization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  doctor_count?: number;
  status?: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export interface DoctorInviteCreateInput {
  /** Picking an existing clinic doctor (see doctorsApi.listByClinic) skips
   * the invite entirely and fast-tracks a direct branch assignment - name
   * and email are looked up server-side and may be omitted. Otherwise both
   * are required to send a normal invite. */
  doctor_id?: string;
  name?: string;
  specialization_ids: string[];
  email?: string;
  phone?: string | null;
  reg_no?: string | null;
  smc_name?: string | null;
  doctor_degree?: string | null;
  fee_amount: number;
  currency: string;
  certificate?: string | null;
  slot_type?: SlotType;
  slot_template: SlotTemplateItem[];
}

export interface ClinicDoctorSummary {
  id: string;
  name: string;
  specialization: string | null;
  specializations: { id: string; name: string }[];
  phone: string | null;
  photo_url?: string | null;
  doctor_degree?: string | null;
  smc_name?: string | null;
  /** The branches of this clinic the doctor is already active at, with the
   * fee/currency/booking type they're set up with there — used to prefill
   * sensible defaults when adding them to a new branch. */
  branches: {
    branch_id: string;
    branch_name: string;
    fee_amount: number;
    currency: string;
    slot_type: SlotType;
  }[];
}

export interface DoctorInvite {
  type: "invite";
  id: string;
  branch_id: string;
  name?: string | null;
  email: string;
  reg_no?: string | null;
  smc_name?: string | null;
  doctor_degree?: string | null;
  specializations?: { id: string; name: string }[];
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at?: string;
}

/** Returned when the doctor already belongs to another branch in the same clinic. */
export interface DirectAssignmentResult {
  type: "direct_assignment";
  id: string;
  branch_id: string;
  email: string;
  doctor_id: string;
  specializations: { id: string; name: string }[];
  status: string;
}

export type DoctorInviteCreateResult = DoctorInvite | DirectAssignmentResult;

export interface UnavailableDateRange {
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface BranchDoctor {
  id: string;
  assignment_id: string;
  name: string;
  specialization: string | null;
  phone: string | null;
  certificate_url: string | null;
  photo_url?: string | null;
  fee_amount: number;
  currency: string;
  branch_id: string;
  slot_type: SlotType;
  start_date: string | null;
  end_date: string | null;
  next_available_slot: string | null;
  unavailable_dates: UnavailableDateRange[];
  rating?: RatingSummary;
}

export interface BranchDoctorsResponse {
  total: number;
  items: BranchDoctor[];
}

export interface DoctorAssignment {
  id: string;
  doctor_id: string;
  branch_id: string;
  fee_amount: number;
  currency: string;
  certificate_url: string | null;
  slot_type: SlotType;
}

export interface DoctorProfile {
  id: string;
  name: string;
  specialization: string | null;
  reg_no?: string | null;
  phone: string | null;
  certificate_url: string | null;
  bio: string | null;
  photo_url?: string | null;
}

export interface DoctorSearchResult {
  id: string;
  name: string;
  specialization: string | null;
  reg_no: string | null;
  phone: string | null;
  clinic_count: number;
  rating?: RatingSummary;
}

export type AvailabilityStatus =
  | "available"
  | "leave"
  | "unavailable"
  | "fully_booked"
  | "outside_schedule"
  | "past";

export interface AvailabilityLeave {
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface AvailabilityResponse {
  date: string;
  status?: AvailabilityStatus;
  is_bookable?: boolean;
  leave?: AvailabilityLeave | null;
  slots: { time: string; available: boolean; slot_type: SlotType }[];
}

export interface AvailabilityPeriod {
  start_date: string | null;
  end_date: string | null;
}

// GET /doctors/:id/availability?from=&to=&branch_id= — range mode.
export interface AvailabilityRangeResponse {
  doctor_id: string;
  branch_id: string;
  availability_period: AvailabilityPeriod;
  leaves: AvailabilityLeave[];
  dates: AvailabilityResponse[];
}

// GET /doctors/:id/availability/week
export interface WeekAvailabilityDay {
  date: string;
  day: string;
  status: AvailabilityStatus;
  is_bookable: boolean;
  display_time: string;
}

export interface WeekAvailabilityResponse {
  week_start: string;
  week_end: string;
  dates: WeekAvailabilityDay[];
}

// GET /doctors/:id/availability/calendar
export interface CalendarAvailabilityDay {
  date: string;
  status: AvailabilityStatus;
  is_bookable: boolean;
}

export interface CalendarAvailabilityResponse {
  year: number;
  month: number;
  availability_period: AvailabilityPeriod;
  dates: CalendarAvailabilityDay[];
}

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "completed"
  | "cancelled"
  | "no_show";

export type PatientRelationship = "self" | "spouse" | "child" | "parent" | "sibling" | "friend" | "other";

// Who the visit is actually for — a patient account can book on behalf of a family
// member/friend, so this can differ from the booking account (Appointment.patient_id /
// AppointmentDetail.patient, which is always the account holder). Present on every
// appointment, list and detail alike; defaults to relationship "self" when the patient
// app didn't specify one.
export interface AppointmentPatientDetails {
  relationship: PatientRelationship;
  name: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
}

export interface Appointment {
  id: string;
  patient_id: string;
  clinic_id: string;
  branch_id: string;
  doctor_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: AppointmentStatus;
  fee_amount: number;
  currency: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  doctor_name?: string;
  branch_name?: string;
  patient_details?: AppointmentPatientDetails;
}

export interface AppointmentPatientSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  photo_url: string | null;
}

export interface AppointmentDetail extends Appointment {
  patient: AppointmentPatientSummary;
}

// Walk-in/on-behalf booking details — mirrors POST /appointments'
// patient_details. `name` is required by the API whenever patient_details is
// sent; everything else is optional.
export interface AppointmentPatientDetailsInput {
  relationship?: PatientRelationship;
  name: string;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
}

export interface AppointmentCreateInput {
  doctor_id: string;
  branch_id: string;
  date: string;
  // Required for `fixed` doctors; omit for `sequential` (server assigns the
  // next free slot in booking order).
  time?: string;
  patient_details?: AppointmentPatientDetailsInput;
}

export interface PaymentInput {
  fee_amount: number;
  method: "cash" | "upi";
  reference_no?: string | null;
}

export interface StatusHistoryEntry {
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_at: string;
  note: string | null;
}

export type NotificationType =
  | "new_booking"
  | "booking_confirmed"
  | "payment_received"
  | "consultation_completed"
  | "prescription_ready"
  | "doctor_invited"
  | "doctor_invite_accepted"
  | "appointment_cancelled"
  | "lab_test_booked"
  | "lab_test_approved"
  | "lab_test_rejected"
  | "lab_test_cancelled"
  | "lab_test_completed"
  | "lab_test_payment_success"
  | "subscription_expiring"
  | "subscription_expired"
  | "subscription_activated"
  | "subscription_deactivated";

// ---------------------------------------------------------------------------
// Lab Tests
// ---------------------------------------------------------------------------

export type LabTestStatus = "active" | "inactive";

// Clinic-defined free text, not a fixed enum — see labTestsApi.categories().
export type LabTestCategory = string;

// An entry from labTestsApi.categories(): registered categories carry an id
// and badge_color; legacy free-text values already used on a test but never
// registered come back with id: null, badge_color: null.
export interface LabTestCategoryOption {
  id: string | null;
  name: string;
  badge_color: string | null;
}

export type LabTestAppointmentServiceMode = "CLINIC" | "HOME";

export type LabTestPaymentMethod = "PAY_AT_CLINIC" | "ONLINE";

export type LabTestAppointmentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "CANCELLED";

export type LabTestPaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface LabTest {
  id: string;
  clinic_id: string;
  name: string;
  code: string;
  description: string | null;
  category: LabTestCategory;
  instructions: string | null;
  default_precautions: string[];
  status: LabTestStatus;
  created_at: string;
  updated_at: string;
}

export interface BranchLabTest {
  id: string;
  clinic_id: string;
  branch_id: string;
  test_id: string;
  test_name: string;
  test_code: string;
  test_category: LabTestCategory;
  test_description: string | null;
  price: number;
  currency: string;
  duration_minutes: number;
  clinic_available: boolean;
  home_collection_available: boolean;
  prescription_required: boolean;
  status: LabTestStatus;
  created_at: string;
  updated_at: string;
}

// Walk-in/on-behalf booking details for a lab test appointment - mirrors
// AppointmentPatientDetailsInput. This is a PROPOSED field: the documented
// POST /lab-test-appointments is patient-only and has no such field today: see
// LabTestAppointmentCreateInput below for the backend contract this needs.
export interface LabTestAppointmentPatientDetailsInput {
  relationship?: PatientRelationship;
  name: string;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
}

export interface LabTestAvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
}

export interface LabTestAvailabilityResponse {
  date: string;
  slots: LabTestAvailabilitySlot[];
}

export interface LabTestSchedule {
  id: string;
  branch_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabTestAppointment {
  id: string;
  appointment_number: string;
  patient_id: string;
  clinic_id: string;
  branch_id: string;
  branch_lab_test_id: string;
  test_id: string;
  service_mode: LabTestAppointmentServiceMode;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  currency: string;
  payment_method: LabTestPaymentMethod | null;
  payment_status: LabTestPaymentStatus;
  prescription_required: boolean;
  prescription_id: string | null;
  patient_notes: string | null;
  clinic_notes: string | null;
  precautions: string[] | null;
  status: LabTestAppointmentStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Only present when service_mode is "HOME".
  home_address?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
  home_contact_phone?: string | null;
  home_notes?: string | null;
  // Present on list/detail responses only - the backend nests these for
  // display so the UI doesn't need a separate lookup per row.
  test?: { id: string; name: string; code: string | null; category: LabTestCategory | null; description?: string | null };
  branch?: { id: string; name: string | null };
  clinic?: { id: string; name: string | null };
  patient?: { id: string; name: string | null; email?: string | null; phone?: string | null };
}

export interface LabTestAppointmentDetail extends LabTestAppointment {
  patient: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
  };
  payments: {
    id: string;
    amount: number;
    currency: string;
    payment_method: LabTestPaymentMethod;
    payment_status: LabTestPaymentStatus;
    transaction_id: string | null;
    provider: string | null;
    paid_at: string | null;
    collected_by: string | null;
    collected_at: string | null;
    reference_no: string | null;
  }[];
  prescriptions: {
    id: string;
    file_name: string;
    file_url: string;
    mime_type: string;
    file_size: number;
    uploaded_at: string;
  }[];
}

export interface LabTestPayment {
  id: string;
  appointment_id: string;
  amount: number;
  currency: string;
  payment_method: LabTestPaymentMethod;
  payment_status: LabTestPaymentStatus;
  transaction_id: string | null;
  provider: string | null;
  paid_at: string | null;
  collected_by: string | null;
  collected_at: string | null;
  reference_no: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  branch_id: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse extends Paginated<Notification> {
  unread_count: number;
}

export interface Prescription {
  id: string;
  appointment_id: string;
  doctor_id: string;
  scan_url: string | null;
  digitized_text: string | null;
  ocr_confidence: number | null;
  finalized_at: string;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  source_type: "appointment" | "lab_test_appointment";
  source_id: string;
  event_type: "booking_confirmed" | "payment_received" | "completed";
  patient_id: string;
  clinic_id: string;
  branch_id: string;
  amount: number | null;
  currency: string;
  payment_method: string | null;
  reference_no: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ScanJobResponse {
  job_id: string;
  status: "processing" | "done" | "failed";
}

export interface ScanJobStatus {
  status: "processing" | "done" | "failed";
  draft_text?: string;
  confidence?: number;
}

export interface MedicalDocument {
  id: string;
  patient_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  photo_url: string | null;
  visit_count: number;
  is_new_patient: boolean;
  first_visit_date: string;
  last_visit_date: string;
}

export interface PatientListResponse {
  items: Patient[];
  has_more: boolean;
}

export interface LedgerEntry {
  id: string;
  branch_id: string;
  branch_name: string;
  period_month: string;
  currency: string;
  total_amount: number;
  payment_count: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Subscriptions & billing
// ---------------------------------------------------------------------------

// Display status adds one derived, never-persisted value (EXPIRING) on top of
// the four stored statuses - see API.md §Subscriptions & billing.
export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "INACTIVE";

export interface Subscription {
  id: string;
  clinic_id: string;
  status: SubscriptionStatus;
  stored_status?: Exclude<SubscriptionStatus, "EXPIRING">;
  is_trial: boolean;
  monthly_amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_remaining: number;
  expiring_soon: boolean;
  auto_renew: boolean;
  inactive_since: string | null;
  deactivation_reason: string | null;
  blocked: boolean;
  blocked_reason: string | null;
}

export type SubscriptionPaymentMethod = "upi" | "card" | "netbanking" | "wallet";

export type SubscriptionPaymentStatus = "PENDING" | "PAID" | "FAILED";

export interface SubscriptionPayment {
  id: string;
  clinic_id: string;
  subscription_id: string;
  invoice_no: string;
  amount: number;
  currency: string;
  months: number;
  method: SubscriptionPaymentMethod | "cash" | "manual";
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  status: SubscriptionPaymentStatus;
  failure_reason: string | null;
  reference_no: string | null;
  verification_method: "signature" | "webhook" | "manual" | null;
  verified_by: string | null;
  verified_at: string | null;
  period_start: string | null;
  period_end: string | null;
  initiated_by: string | null;
  created_at: string;
}

export interface SubscriptionPlanInfo {
  id: string | null;
  name: string;
  monthly_amount: number;
  currency: string;
  trial_months: number;
}

export interface SubscriptionDetailResponse {
  subscription: Subscription;
  current_plan: SubscriptionPlanInfo;
  settings: {
    expiring_warning_days: number;
    max_months_per_payment: number;
  };
}

export interface SubscriptionHistoryEntry {
  id: string;
  clinic_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  changed_by: string | null;
  source: "system" | "clinic" | "super_admin" | "payment" | "webhook";
  created_at: string;
}

export interface SubscriptionInitiatePaymentResponse {
  payment: SubscriptionPayment;
  plan: {
    name: string;
    monthly_amount: number;
    currency: string;
    months: number;
  };
  next_steps: string[];
}

export interface SubscriptionVerifyPaymentResponse {
  message: string;
  payment: SubscriptionPayment;
  subscription: Subscription;
}

export interface SubscriptionReactivateResponse {
  reactivated: boolean;
  payment_applied: boolean;
  message: string;
  subscription: Subscription;
}

export interface SubscriptionTrialView {
  clinic_id: string;
  trial: {
    is_trial: boolean;
    status: SubscriptionStatus | "CONCLUDED";
    started_at: string | null;
    ends_at: string | null;
    days_remaining: number;
    expiring_soon: boolean;
    expired: boolean;
  };
  subscription_status: SubscriptionStatus;
  monthly_amount: number;
  currency: string;
  blocked: boolean;
  blocked_reason: string | null;
}

// ---------------------------------------------------------------------------
// Super Admin platform
// ---------------------------------------------------------------------------

export interface SuperAdminClinicListItem {
  id: string;
  name: string;
  city?: string | null;
  district?: string | null;
  owner: {
    id: string;
    email: string;
    name: string;
    phone?: string | null;
  };
  branch_count: number;
  subscription: Subscription | null;
  created_at: string;
}

export interface SuperAdminClinicDetail {
  id: string;
  name: string;
  description: string | null;
  location: {
    nearby_location: string | null;
    city: string | null;
    district: string | null;
    pin_code: string | null;
    state: string | null;
  };
  owner: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    account_status: string;
    created_at: string | null;
  };
  licenses: {
    trade_license_number: string | null;
    trade_license_validation_status: TradeLicenseValidationStatus | null;
    drug_license_number: string | null;
    clinical_establishment_reg_number: string | null;
  };
  subscription: Subscription;
  branches: {
    id: string;
    name: string;
    address: string;
    city: string | null;
    district: string | null;
    pin_code: string | null;
    state: string | null;
    phone: string;
    timezone: string;
    trade_license_validation_status: TradeLicenseValidationStatus | null;
    created_at: string;
  }[];
  staff: {
    user_id: string;
    name: string;
    email: string;
    phone: string | null;
    account_status: string;
    branch_id: string;
    branch_name: string;
    added_at: string;
  }[];
  doctors: {
    id: string;
    name: string;
    specialization: string | null;
    reg_no: string | null;
    smc_name: string | null;
    degree: string | null;
    branch_id: string;
    fee_amount: number;
    currency: string;
  }[];
  lab_configuration: {
    active_tests: number;
    categories: number;
    branch_test_links: number;
  };
  appointment_summary: {
    by_status: Record<string, number>;
    lab_tests_by_status: Record<string, number>;
    appointments_last_30d: number;
    collected_estimate_inr: number;
  };
  created_at: string;
}

export interface SuperAdminSubscriptionDetailResponse {
  subscription: Subscription;
  current_plan: SubscriptionPlanInfo;
  lifetime: {
    total_paid: number;
    paid_payment_count: number;
  };
}

export interface AuditLogEntry {
  id: string;
  actor: { user_id: string; email: string } | null;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: { from?: unknown; to?: unknown } & Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  value: string;
  description?: string | null;
  updated_at?: string;
}

export interface PlatformSettingsResponse {
  items: PlatformSetting[];
  editable_keys: { key: string; description: string }[];
}

export interface SuperAdminStatistics {
  clinics: {
    total: number;
    by_status: Record<"TRIAL" | "ACTIVE" | "EXPIRED" | "INACTIVE", number>;
    expiring_within_days: number;
    expiring_window_days: number;
  };
  revenue_inr: {
    total_collected: number;
    current_month: number;
    previous_month: number;
    paid_payment_count: number;
    monthly_breakdown: { month: string; amount: number; count: number }[];
  };
  mrr_estimate_inr: number;
  current_plan: { name: string; monthly_amount: number; currency: string };
}

export interface SuperAdminGrantItem {
  user_id: string;
  email: string;
  name: string;
  account_status: string;
  revoked: boolean;
  granted_by_email: string | null;
  granted_at: string;
}

export interface SuperAdminPlanVersion {
  id: string;
  name: string;
  billing_period: string;
  monthly_amount: number;
  currency: string;
  trial_months: number;
  is_active: boolean;
  effective_from: string | null;
  created_by_email: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const authApi = {
  // ── Clinic owner: registration (2-step OTP) ──────────────────────────
  async sendClinicOwnerOtp(input: {
    name: string;
    clinicName: string;
    phone: string;
    email?: string;
  }): Promise<{ ok: boolean; message: string }> {
    return apiFetch<{ ok: boolean; message: string }>("/auth/clinic-owner/send-otp", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async registerClinicOwner(input: {
    name: string;
    clinicName: string;
    phone: string;
    email?: string;
    otp: string;
  }): Promise<ClinicOwnerAuthResponse & { clinic?: Clinic }> {
    return apiFetch<ClinicOwnerAuthResponse & { clinic?: Clinic }>("/auth/clinic-owner/register", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Clinic owner: login (2-step OTP) ─────────────────────────────────
  async sendClinicOwnerLoginOtp(phone: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/clinic-owner/login", {
      method: "POST",
      body: JSON.stringify({ phone }),
      skipAuth: true,
    });
  },

  async verifyClinicOwnerOtp(input: {
    phone: string;
    otp: string;
  }): Promise<ClinicOwnerAuthResponse> {
    return apiFetch<ClinicOwnerAuthResponse>("/auth/clinic-owner/verify-otp", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async loginClinicOwnerWithPassword(input: {
    phone: string;
    password: string;
  }): Promise<ClinicOwnerAuthResponse> {
    return apiFetch<ClinicOwnerAuthResponse>("/auth/clinic-owner/login-password", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Doctor: login (2-step OTP) ───────────────────────────────────────
  async sendDoctorLoginOtp(phone: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/doctor/login", {
      method: "POST",
      body: JSON.stringify({ phone }),
      skipAuth: true,
    });
  },

  async verifyDoctorOtp(input: {
    phone: string;
    otp: string;
  }): Promise<DoctorAuthResponse> {
    return apiFetch<DoctorAuthResponse>("/auth/doctor/verify-otp", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Branch staff: login (2-step OTP by phone) ────────────────────────
  async branchStaffLogin(phone: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/branch-staff/login", {
      method: "POST",
      body: JSON.stringify({ phone }),
      skipAuth: true,
    });
  },

  async verifyStaffOtp(input: {
    phone: string;
    otp: string;
  }): Promise<ClinicOwnerAuthResponse> {
    return apiFetch<ClinicOwnerAuthResponse>("/auth/branch-staff/verify-otp", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Doctor: accept invite (phone + OTP) ──────────────────────────────
  async acceptDoctorInvite(input: {
    phone: string;
    invite_code: string;
    otp: string;
    email?: string;
    password?: string;
    reg_no?: string;
  }): Promise<DoctorInviteAcceptResponse> {
    return apiFetch<DoctorInviteAcceptResponse>("/auth/doctor/accept-invite", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Verify phone (for invite pre-verification) ───────────────────────
  async sendVerifyPhoneOtp(input: {
    phone: string;
    email?: string;
  }): Promise<{ ok: boolean; message: string }> {
    return apiFetch<{ ok: boolean; message: string }>("/auth/verify-phone/send", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Password reset (2-step OTP by phone) ─────────────────────────────
  async forgotPassword(phone: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ phone }),
      skipAuth: true,
    });
  },

  async resetPassword(input: {
    phone: string;
    otp: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // Auth required. Lets an already-logged-in user (who signed in via OTP
  // with no password on file) set one without re-verifying by OTP again.
  async setPassword(input: {
    new_password: string;
    confirm_password: string;
  }): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/set-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // ── Email verification (unchanged) ───────────────────────────────────
  async verifyEmail(token: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
      skipAuth: true,
    });
  },

  // ── Patient (unchanged for now — phone-based changes are backend-only) ─
  async registerPatient(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<PatientAuthResponse> {
    return apiFetch<PatientAuthResponse>("/auth/patient/register", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async loginPatient(input: {
    email: string;
    password: string;
  }): Promise<PatientAuthResponse> {
    return apiFetch<PatientAuthResponse>("/auth/patient/login", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  // ── Super admin: phone + password ────────────────────────────────────
  async loginSuperAdmin(input: {
    phone: string;
    password: string;
  }): Promise<SuperAdminAuthResponse> {
    return apiFetch<SuperAdminAuthResponse>("/auth/super-admin/login", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async refresh(input: { refresh_token: string }): Promise<AuthTokens> {
    return apiFetch<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async logout(input: { refresh_token: string }): Promise<void> {
    return apiFetch<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

// ---------------------------------------------------------------------------
// Clinics
// ---------------------------------------------------------------------------

export interface ClinicListParams {
  search?: string;
  limit?: number;
  cursor?: string;
}

export const clinicsApi = {
  async list(params: ClinicListParams = {}): Promise<Paginated<Clinic>> {
    return apiFetch<Paginated<Clinic>>(
      `/clinics${query({ search: params.search, limit: params.limit, cursor: params.cursor })}`
    );
  },

  // Authenticated owner's own clinics (full detail incl. licenses).
  async mine(): Promise<{ items: Clinic[] }> {
    return apiFetch<{ items: Clinic[] }>("/clinics/mine");
  },

  // Public discovery for patients.
  async nearby(input: { lat: number; lng: number; radius_km?: number; limit?: number }): Promise<Clinic[]> {
    return apiFetch<Clinic[]>(
      `/clinics/nearby${query({ lat: input.lat, lng: input.lng, radius_km: input.radius_km, limit: input.limit })}`
    );
  },

  async create(input: ClinicCreateInput): Promise<Clinic> {
    return apiFetch<Clinic>("/clinics", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async get(id: string): Promise<Clinic> {
    return apiFetch<Clinic>(`/clinics/${id}`);
  },

  async update(id: string, input: Partial<ClinicCreateInput>): Promise<Clinic> {
    return apiFetch<Clinic>(`/clinics/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async validateTradeLicense(tradeLicenseNumber: string): Promise<TradeLicenseValidationResult> {
    return apiFetch<TradeLicenseValidationResult>("/clinics/validate-trade-license", {
      method: "POST",
      body: JSON.stringify({ trade_license_number: tradeLicenseNumber }),
    });
  },


  async remove(id: string, force = false): Promise<void> {
    return apiFetch<void>(`/clinics/${id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
    });
  },

  async uploadLicense(
    id: string,
    type: ClinicLicenseType,
    file: File
  ): Promise<ClinicLicenseUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ClinicLicenseUploadResponse>(`/clinics/${id}/licenses/${type}`, {
      method: "POST",
      body: form,
    });
  },
};

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export const branchesApi = {
  async list(clinicId: string): Promise<Paginated<Branch>> {
    return apiFetch<Paginated<Branch>>(`/clinics/${clinicId}/branches`);
  },

  // Public discovery for patients.
  async nearby(input: {
    lat: number;
    lng: number;
    radius_km?: number;
    limit?: number;
  }): Promise<(Branch & { clinic_name?: string | null; distance_km?: number })[]> {
    return apiFetch<(Branch & { clinic_name?: string | null; distance_km?: number })[]>(
      `/branches/nearby${query({
        lat: input.lat,
        lng: input.lng,
        radius_km: input.radius_km,
        limit: input.limit,
      })}`
    );
  },

  async create(clinicId: string, input: BranchCreateInput): Promise<Branch> {
    return apiFetch<Branch>(`/clinics/${clinicId}/branches`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(id: string, input: Partial<BranchCreateInput>): Promise<Branch> {
    return apiFetch<Branch>(`/branches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },


  // Postal pincode lookup using India Post public API
  async lookupPincode(pincode: string): Promise<{
    Status: string;
    Message: string;
    PostOffice: {
      Name: string;
      BranchType: string;
      DeliveryStatus: string;
      District: string;
      State: string;
      Pincode: string;
    }[];
  }[]> {
    const res = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pincode)}`);
    if (!res.ok) {
      throw new ApiError(`Pincode lookup failed (${res.status})`, "PINCODE_LOOKUP_FAILED", res.status);
    }
    const data = (await res.json()) as any;
    return data;
  },


  async remove(id: string, force = false): Promise<void> {
    return apiFetch<void>(`/branches/${id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
    });
  },

  async getPhotoUploadGrant(id: string): Promise<PhotoUploadGrant> {
    return apiFetch<PhotoUploadGrant>(`/branches/${id}/photo/signature`, {
      method: "POST",
    });
  },

  async uploadPhoto(id: string, file: File): Promise<{ photo_url: string }> {
    const grant = await branchesApi.getPhotoUploadGrant(id);
    await uploadFileToCloudinary(grant, file);
    return apiFetch<{ photo_url: string }>(`/branches/${id}/photo`, {
      method: "POST",
      body: JSON.stringify({ public_id: grant.public_id }),
    });
  },

  async getGalleryUploadGrant(id: string): Promise<PhotoUploadGrant> {
    return apiFetch<PhotoUploadGrant>(`/branches/${id}/gallery/signature`, {
      method: "POST",
    });
  },

  async uploadGalleryImage(id: string, file: File): Promise<BranchGalleryImage> {
    const grant = await branchesApi.getGalleryUploadGrant(id);
    await uploadFileToCloudinary(grant, file);
    return apiFetch<BranchGalleryImage>(`/branches/${id}/gallery`, {
      method: "POST",
      body: JSON.stringify({ public_id: grant.public_id }),
    });
  },

  async listGallery(id: string): Promise<Paginated<BranchGalleryImage>> {
    return apiFetch<Paginated<BranchGalleryImage>>(`/branches/${id}/gallery`);
  },

  async removeGalleryImage(branchId: string, imageId: string): Promise<void> {
    return apiFetch<void>(`/branches/${branchId}/gallery/${imageId}`, {
      method: "DELETE",
    });
  },

  async uploadLicense(
    id: string,
    type: BranchLicenseType,
    file: File
  ): Promise<BranchLicenseUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<BranchLicenseUploadResponse>(`/branches/${id}/licenses/${type}`, {
      method: "POST",
      body: form,
    });
  },
};

// ---------------------------------------------------------------------------
// Branch schedule (operating days + branch-wide closures)
// ---------------------------------------------------------------------------

export interface BranchOperatingDay {
  weekday: number; // 0=Sun..6=Sat
  is_open: boolean;
}

export interface BranchScheduleResponse {
  branch_id: string;
  operating_days: BranchOperatingDay[];
}

export interface BranchClosure {
  id: string;
  branch_id?: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "active" | "cancelled";
  created_at?: string;
}

export const branchScheduleApi = {
  async get(branchId: string): Promise<BranchScheduleResponse> {
    return apiFetch<BranchScheduleResponse>(`/branches/${branchId}/schedule`);
  },

  async updateOperatingDays(
    branchId: string,
    operatingDays: BranchOperatingDay[]
  ): Promise<BranchScheduleResponse> {
    return apiFetch<BranchScheduleResponse>(`/branches/${branchId}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ operating_days: operatingDays }),
    });
  },

  async listClosures(branchId: string): Promise<Paginated<BranchClosure>> {
    return apiFetch<Paginated<BranchClosure>>(`/branches/${branchId}/schedule/closures`);
  },

  async createClosure(
    branchId: string,
    input: { start_date: string; end_date?: string | null; reason?: string | null }
  ): Promise<BranchClosure> {
    return apiFetch<BranchClosure>(`/branches/${branchId}/schedule/closures`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async removeClosure(branchId: string, closureId: string): Promise<void> {
    return apiFetch<void>(`/branches/${branchId}/schedule/closures/${closureId}`, {
      method: "DELETE",
    });
  },
};

// ---------------------------------------------------------------------------
// Branch staff
// ---------------------------------------------------------------------------

// GET /branch-staff/me is the authoritative source for a logged-in staff
// member's clinic/branch/permissions - it never trusts a client-supplied
// clinic_id/branch_id, so the UI should drive the "my branch" view from
// this instead of letting staff pick a branch out of the full directory.
export const branchStaffApi = {
  async me(): Promise<BranchStaffMe> {
    return apiFetch<BranchStaffMe>("/branch-staff/me");
  },
};

export const staffApi = {
  async list(branchId: string): Promise<Paginated<StaffMember>> {
    return apiFetch<Paginated<StaffMember>>(`/branches/${branchId}/staff`);
  },

  async create(
    branchId: string,
    input: { name: string; phone: string; permissions?: BranchStaffPermission[] }
  ): Promise<StaffMember> {
    return apiFetch<StaffMember>(`/branches/${branchId}/staff`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async remove(branchId: string, staffId: string): Promise<void> {
    return apiFetch<void>(`/branches/${branchId}/staff/${staffId}`, {
      method: "DELETE",
    });
  },

  async getPermissions(
    branchId: string,
    staffId: string
  ): Promise<{ staff_id: string; branch_id: string; permissions: string[] }> {
    return apiFetch<{ staff_id: string; branch_id: string; permissions: string[] }>(
      `/branches/${branchId}/staff/${staffId}/permissions`
    );
  },

  async setPermissions(
    branchId: string,
    staffId: string,
    permissions: BranchStaffPermission[]
  ): Promise<{ staff_id: string; branch_id: string; permissions: string[] }> {
    return apiFetch<{ staff_id: string; branch_id: string; permissions: string[] }>(
      `/branches/${branchId}/staff/${staffId}/permissions`,
      {
        method: "PATCH",
        body: JSON.stringify({ permissions }),
      }
    );
  },
};

// ---------------------------------------------------------------------------
// Doctor invites & assignments
// ---------------------------------------------------------------------------

export const doctorInvitesApi = {
  async create(branchId: string, input: DoctorInviteCreateInput): Promise<DoctorInviteCreateResult> {
    return apiFetch<DoctorInviteCreateResult>(`/branches/${branchId}/doctor-invites`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async list(branchId: string): Promise<Paginated<DoctorInvite>> {
    return apiFetch<Paginated<DoctorInvite>>(`/branches/${branchId}/doctor-invites`);
  },

  async revoke(id: string): Promise<void> {
    return apiFetch<void>(`/doctor-invites/${id}`, { method: "DELETE" });
  },

  // No invite exists yet at this point (it's created in one shot by `create`
  // above), so this is a signed direct-to-Cloudinary upload rather than the
  // "upload against an existing id" pattern used elsewhere — the resulting
  // URL is just carried as a plain string into DoctorInviteCreateInput.certificate.
  async getCertificateUploadGrant(): Promise<PhotoUploadGrant> {
    return apiFetch<PhotoUploadGrant>("/doctor-invites/certificate/signature", {
      method: "POST",
    });
  },

  async uploadCertificate(file: File): Promise<{ certificate_url: string }> {
    const grant = await doctorInvitesApi.getCertificateUploadGrant();
    const { secure_url } = await uploadFileToCloudinary(grant, file);
    return { certificate_url: secure_url };
  },
};

export const doctorSpecializationsApi = {
  async list(q?: string): Promise<{ items: DoctorSpecialization[] }> {
    return apiFetch<{ items: DoctorSpecialization[] }>(
      `/doctors/specializations${query({ q })}`
    );
  },

  async create(name: string, description?: string): Promise<DoctorSpecialization> {
    return apiFetch<DoctorSpecialization>(`/doctors/specializations`, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  },
};

export const doctorsApi = {
  async listByBranch(branchId: string): Promise<BranchDoctorsResponse> {
    return apiFetch<BranchDoctorsResponse>(`/branches/${branchId}/doctors`);
  },

  async availability(
    doctorId: string,
    date: string,
    branchId?: string
  ): Promise<AvailabilityResponse> {
    return apiFetch<AvailabilityResponse>(
      `/doctors/${doctorId}/availability${query({ date, branch_id: branchId })}`
    );
  },

  // Range mode: one call for a whole visible window instead of one availability()
  // call per day.
  async availabilityRange(
    doctorId: string,
    params: { from: string; to: string; branchId: string }
  ): Promise<AvailabilityRangeResponse> {
    return apiFetch<AvailabilityRangeResponse>(
      `/doctors/${doctorId}/availability${query({
        from: params.from,
        to: params.to,
        branch_id: params.branchId,
      })}`
    );
  },

  async availabilityWeek(
    doctorId: string,
    branchId: string,
    date?: string
  ): Promise<WeekAvailabilityResponse> {
    return apiFetch<WeekAvailabilityResponse>(
      `/doctors/${doctorId}/availability/week${query({ branch_id: branchId, date })}`
    );
  },

  async availabilityCalendar(
    doctorId: string,
    params: { branchId: string; year: number; month: number }
  ): Promise<CalendarAvailabilityResponse> {
    return apiFetch<CalendarAvailabilityResponse>(
      `/doctors/${doctorId}/availability/calendar${query({
        branch_id: params.branchId,
        year: params.year,
        month: params.month,
      })}`
    );
  },

  async search(q: string, limit = 10): Promise<Paginated<DoctorSearchResult>> {
    return apiFetch<Paginated<DoctorSearchResult>>(
      `/doctors/search${query({ q, limit })}`
    );
  },

  /** Doctors already actively assigned somewhere in this clinic - powers the
   * "add existing doctor" picker. `excludeBranchId` drops doctors already
   * active at that branch (typically the target branch of the add). */
  async listByClinic(
    clinicId: string,
    opts?: { excludeBranchId?: string }
  ): Promise<{ items: ClinicDoctorSummary[] }> {
    return apiFetch<{ items: ClinicDoctorSummary[] }>(
      `/clinics/${clinicId}/doctors${query({ exclude_branch_id: opts?.excludeBranchId })}`
    );
  },

  async me(): Promise<DoctorProfile> {
    return apiFetch<DoctorProfile>("/doctors/me");
  },

  async myAssignments(): Promise<Paginated<DoctorAssignmentSummary>> {
    return apiFetch<Paginated<DoctorAssignmentSummary>>("/doctors/me/assignments");
  },

  async updateMe(input: Partial<DoctorProfile>): Promise<DoctorProfile> {
    return apiFetch<DoctorProfile>("/doctors/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async getMyPhotoUploadGrant(): Promise<PhotoUploadGrant> {
    return apiFetch<PhotoUploadGrant>("/doctors/me/photo/signature", {
      method: "POST",
    });
  },

  async uploadPhoto(file: File): Promise<{ photo_url: string }> {
    const grant = await doctorsApi.getMyPhotoUploadGrant();
    await uploadFileToCloudinary(grant, file);
    return apiFetch<{ photo_url: string }>("/doctors/me/photo", {
      method: "POST",
      body: JSON.stringify({ public_id: grant.public_id }),
    });
  },

  async getBranchDoctorPhotoUploadGrant(
    branchId: string,
    doctorId: string
  ): Promise<PhotoUploadGrant> {
    return apiFetch<PhotoUploadGrant>(
      `/branches/${branchId}/doctors/${doctorId}/photo/signature`,
      { method: "POST" }
    );
  },

  async uploadBranchDoctorPhoto(
    branchId: string,
    doctorId: string,
    file: File
  ): Promise<{ photo_url: string }> {
    const grant = await doctorsApi.getBranchDoctorPhotoUploadGrant(branchId, doctorId);
    await uploadFileToCloudinary(grant, file);
    return apiFetch<{ photo_url: string }>(
      `/branches/${branchId}/doctors/${doctorId}/photo`,
      {
        method: "POST",
        body: JSON.stringify({ public_id: grant.public_id }),
      }
    );
  },

  async updateAssignment(
    id: string,
    input: Partial<{
      fee_amount: number;
      slot_type: SlotType;
      slot_template: SlotTemplateItem[];
      certificate: string;
    }>
  ): Promise<DoctorAssignment> {
    return apiFetch<DoctorAssignment>(`/doctor-assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async uploadAssignmentCertificate(
    assignmentId: string,
    file: File
  ): Promise<{ certificate_url: string }> {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ certificate_url: string }>(
      `/doctor-assignments/${assignmentId}/certificate`,
      {
        method: "POST",
        body: form,
      }
    );
  },

  async removeAssignment(id: string): Promise<void> {
    return apiFetch<void>(`/doctor-assignments/${id}`, { method: "DELETE" });
  },

  async listExceptions(assignmentId: string): Promise<Paginated<DoctorAssignmentException>> {
    return apiFetch<Paginated<DoctorAssignmentException>>(
      `/doctor-assignments/${assignmentId}/exceptions`
    );
  },

  async createException(
    assignmentId: string,
    input: { excluded_date: string; end_date?: string | null; reason?: string | null }
  ): Promise<DoctorAssignmentException> {
    return apiFetch<DoctorAssignmentException>(
      `/doctor-assignments/${assignmentId}/exceptions`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },

  async removeException(assignmentId: string, exceptionId: string): Promise<void> {
    return apiFetch<void>(
      `/doctor-assignments/${assignmentId}/exceptions/${exceptionId}`,
      { method: "DELETE" }
    );
  },
};

// ---------------------------------------------------------------------------
// Reviews & ratings
// ---------------------------------------------------------------------------

// Public — patient_name is masked to first name + last initial (see API.md).
export interface DoctorReview {
  id: string;
  patient_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// Clinic-side — full patient_name, plus which doctor it's for.
export interface BranchReview {
  id: string;
  doctor_id: string;
  doctor_name: string;
  patient_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface ReviewsResponse<T> {
  rating: RatingSummary;
  items: T[];
  has_more: boolean;
}

export const reviewsApi = {
  async forDoctor(
    doctorId: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<ReviewsResponse<DoctorReview>> {
    return apiFetch<ReviewsResponse<DoctorReview>>(
      `/doctors/${doctorId}/reviews${query({ limit: params.limit, offset: params.offset })}`
    );
  },

  async forBranch(
    branchId: string,
    params: { doctorId?: string; limit?: number; offset?: number } = {}
  ): Promise<ReviewsResponse<BranchReview>> {
    return apiFetch<ReviewsResponse<BranchReview>>(
      `/branches/${branchId}/reviews${query({
        doctor_id: params.doctorId,
        limit: params.limit,
        offset: params.offset,
      })}`
    );
  },
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export interface AppointmentListParams {
  clinic_id?: string;
  status?: AppointmentStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  cursor?: string;
}

export const appointmentsApi = {
  async create(input: AppointmentCreateInput, idempotencyKey: string): Promise<Appointment> {
    return apiFetch<Appointment>("/appointments", {
      method: "POST",
      body: JSON.stringify(input),
      idempotencyKey,
    });
  },

  async list(params: AppointmentListParams = {}): Promise<Paginated<Appointment>> {
    return apiFetch<Paginated<Appointment>>(
      `/appointments${query({
        clinic_id: params.clinic_id,
        status: params.status,
        date_from: params.date_from,
        date_to: params.date_to,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async get(id: string): Promise<AppointmentDetail> {
    return apiFetch<AppointmentDetail>(`/appointments/${id}`);
  },

  async confirm(id: string): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/confirm`, { method: "PATCH" });
  },

  async pay(id: string, input: PaymentInput, idempotencyKey: string): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify(input),
      idempotencyKey,
    });
  },

  async complete(id: string): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/complete`, { method: "PATCH" });
  },

  async cancel(id: string, reason: string): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    });
  },

  async statusHistory(id: string): Promise<Paginated<StatusHistoryEntry>> {
    return apiFetch<Paginated<StatusHistoryEntry>>(`/appointments/${id}/status-history`);
  },

  // Patient-only: review a completed appointment (1-5 rating).
  async review(id: string, input: { rating: number; comment?: string }): Promise<BranchReview> {
    return apiFetch<BranchReview>(`/appointments/${id}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationListParams {
  unread_only?: boolean;
  limit?: number;
  cursor?: string;
}

export const notificationsApi = {
  async list(params: NotificationListParams = {}): Promise<NotificationListResponse> {
    return apiFetch<NotificationListResponse>(
      `/notifications${query({
        unread_only: params.unread_only,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async markRead(id: string): Promise<Notification> {
    return apiFetch<Notification>(`/notifications/${id}/read`, { method: "PATCH" });
  },

  async markAllRead(branchId?: string): Promise<void> {
    return apiFetch<void>("/notifications/read-all", {
      method: "PATCH",
      body: JSON.stringify(branchId ? { branch_id: branchId } : {}),
    });
  },

  async registerDeviceToken(input: {
    token: string;
    platform: "web" | "android" | "ios";
  }): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/notifications/device-tokens", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async removeDeviceToken(token: string): Promise<void> {
    return apiFetch<void>(`/notifications/device-tokens${query({ token })}`, {
      method: "DELETE",
    });
  },
};

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export const prescriptionsApi = {
  async uploadScan(appointmentId: string, file: File): Promise<ScanJobResponse> {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ScanJobResponse>(`/appointments/${appointmentId}/prescription/scan`, {
      method: "POST",
      body: form,
    });
  },

  async getScanJob(jobId: string): Promise<ScanJobStatus> {
    return apiFetch<ScanJobStatus>(`/prescription-scan-jobs/${jobId}`);
  },

  async put(
    appointmentId: string,
    input: { text: string; scan_url?: string | null }
  ): Promise<Prescription> {
    return apiFetch<Prescription>(`/appointments/${appointmentId}/prescription`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async get(appointmentId: string): Promise<Prescription> {
    return apiFetch<Prescription>(`/appointments/${appointmentId}/prescription`);
  },

  async email(appointmentId: string): Promise<{ queued: boolean }> {
    return apiFetch<{ queued: boolean }>(`/appointments/${appointmentId}/prescription/email`, {
      method: "POST",
    });
  },

  async pdf(appointmentId: string): Promise<Blob> {
    const token = getAccessToken();
    const res = await fetch(
      `${API_BASE_URL}/appointments/${appointmentId}/prescription/pdf`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!res.ok) {
      let envelope: ErrorEnvelope | null = null;
      try {
        envelope = (await res.json()) as ErrorEnvelope;
      } catch {
        // non-JSON body
      }
      const err = envelope?.error;
      throw new ApiError(
        err?.message || `Request failed with status ${res.status}`,
        err?.code || "INTERNAL_ERROR",
        res.status,
        err?.field ?? null,
        err?.request_id ?? null
      );
    }
    return res.blob();
  },
};

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

async function fetchPdfBlob(path: string): Promise<Blob> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let envelope: ErrorEnvelope | null = null;
    try {
      envelope = (await res.json()) as ErrorEnvelope;
    } catch {
      // non-JSON body
    }
    const err = envelope?.error;
    throw new ApiError(
      err?.message || `Request failed with status ${res.status}`,
      err?.code || "INTERNAL_ERROR",
      res.status,
      err?.field ?? null,
      err?.request_id ?? null
    );
  }
  return res.blob();
}

export const receiptsApi = {
  async list(appointmentId: string): Promise<{ data: Receipt[] }> {
    return apiFetch<{ data: Receipt[] }>(`/appointments/${appointmentId}/receipts`);
  },

  async listLabTest(appointmentId: string): Promise<{ data: Receipt[] }> {
    return apiFetch<{ data: Receipt[] }>(`/lab-test-appointments/${appointmentId}/receipts`);
  },

  async pdf(appointmentId: string, receiptId: string): Promise<Blob> {
    return fetchPdfBlob(`/appointments/${appointmentId}/receipts/${receiptId}/pdf`);
  },

  async pdfLabTest(appointmentId: string, receiptId: string): Promise<Blob> {
    return fetchPdfBlob(`/lab-test-appointments/${appointmentId}/receipts/${receiptId}/pdf`);
  },
};

// ---------------------------------------------------------------------------
// Medical documents
// ---------------------------------------------------------------------------

export const medicalDocumentsApi = {
  async upload(file: File): Promise<MedicalDocument> {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<MedicalDocument>("/patients/me/medical-documents", {
      method: "POST",
      body: form,
    });
  },

  async list(): Promise<Paginated<MedicalDocument>> {
    return apiFetch<Paginated<MedicalDocument>>("/patients/me/medical-documents");
  },

  async remove(id: string): Promise<void> {
    return apiFetch<void>(`/medical-documents/${id}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export interface PatientListParams {
  search?: string;
  type?: "new" | "old";
  limit?: number;
  offset?: number;
}

export const patientsApi = {
  async listByBranch(
    branchId: string,
    params: PatientListParams = {}
  ): Promise<PatientListResponse> {
    return apiFetch<PatientListResponse>(
      `/branches/${branchId}/patients${query({
        search: params.search,
        type: params.type,
        limit: params.limit,
        offset: params.offset,
      })}`
    );
  },
};

// ---------------------------------------------------------------------------
// Payment ledger
// ---------------------------------------------------------------------------

export const ledgerApi = {
  async list(clinicId: string, month?: string): Promise<{ items: LedgerEntry[] }> {
    return apiFetch<{ items: LedgerEntry[] }>(
      `/clinics/${clinicId}/ledger${query({ month })}`
    );
  },
};

// ---------------------------------------------------------------------------
// Subscriptions & billing
// ---------------------------------------------------------------------------

export const subscriptionsApi = {
  async get(clinicId: string): Promise<SubscriptionDetailResponse> {
    return apiFetch<SubscriptionDetailResponse>(`/clinics/${clinicId}/subscription`);
  },

  async history(
    clinicId: string,
    params: { limit?: number; cursor?: string } = {}
  ): Promise<Paginated<SubscriptionHistoryEntry>> {
    return apiFetch<Paginated<SubscriptionHistoryEntry>>(
      `/clinics/${clinicId}/subscription/history${query({
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async payments(
    clinicId: string,
    params: {
      status?: SubscriptionPaymentStatus;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<Paginated<SubscriptionPayment>> {
    return apiFetch<Paginated<SubscriptionPayment>>(
      `/clinics/${clinicId}/subscription/payments${query({
        status: params.status,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  // Amount is always computed server-side (plan.amount × months); the client
  // never sends it.
  async initiatePayment(
    clinicId: string,
    input: { months: number; method?: SubscriptionPaymentMethod }
  ): Promise<SubscriptionInitiatePaymentResponse> {
    return apiFetch<SubscriptionInitiatePaymentResponse>(
      `/clinics/${clinicId}/subscription/payments`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },

  // paymentId matches by id OR provider_order_id.
  async verifyPayment(
    clinicId: string,
    paymentId: string,
    input: {
      provider_payment_id: string;
      provider_signature: string;
      reference_no?: string | null;
    }
  ): Promise<SubscriptionVerifyPaymentResponse> {
    return apiFetch<SubscriptionVerifyPaymentResponse>(
      `/clinics/${clinicId}/subscription/payments/${paymentId}/verify`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },

  async reactivate(clinicId: string): Promise<SubscriptionReactivateResponse> {
    return apiFetch<SubscriptionReactivateResponse>(
      `/clinics/${clinicId}/subscription/reactivate`,
      { method: "POST" }
    );
  },

  // Trial-focused view for a dedicated widget.
  async trial(clinicId: string): Promise<SubscriptionTrialView> {
    return apiFetch<SubscriptionTrialView>(`/clinics/${clinicId}/subscription/trial`);
  },
};

// ---------------------------------------------------------------------------
// Super Admin platform
// ---------------------------------------------------------------------------

export interface SuperAdminClinicListParams {
  q?: string;
  subscription_status?: SubscriptionStatus;
  limit?: number;
  cursor?: string;
}

export interface SuperAdminAuditLogParams {
  action?: string;
  actor_user_id?: string;
  resource_type?: string;
  resource_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export const superAdminApi = {
  async clinics(params: SuperAdminClinicListParams = {}): Promise<Paginated<SuperAdminClinicListItem>> {
    return apiFetch<Paginated<SuperAdminClinicListItem>>(
      `/super-admin/clinics${query({
        q: params.q,
        subscription_status: params.subscription_status,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async clinic(clinicId: string): Promise<SuperAdminClinicDetail> {
    return apiFetch<SuperAdminClinicDetail>(`/super-admin/clinics/${clinicId}`);
  },

  async activateClinic(clinicId: string): Promise<{ message: string; subscription: Subscription }> {
    return apiFetch(`/super-admin/clinics/${clinicId}/activate`, { method: "POST" });
  },

  async deactivateClinic(clinicId: string, reason: string): Promise<{ message: string; subscription: Subscription }> {
    return apiFetch(`/super-admin/clinics/${clinicId}/deactivate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async clinicPayments(
    clinicId: string,
    params: { status?: SubscriptionPaymentStatus; limit?: number; cursor?: string } = {}
  ): Promise<Paginated<SubscriptionPayment>> {
    return apiFetch<Paginated<SubscriptionPayment>>(
      `/super-admin/clinics/${clinicId}/payments${query({
        status: params.status,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async clinicSubscription(clinicId: string): Promise<SuperAdminSubscriptionDetailResponse> {
    return apiFetch<SuperAdminSubscriptionDetailResponse>(
      `/super-admin/clinics/${clinicId}/subscription`
    );
  },

  async extendSubscription(
    clinicId: string,
    input: { months?: number; trial_days?: number; reason: string }
  ): Promise<{ message: string; subscription: Subscription }> {
    return apiFetch(`/super-admin/clinics/${clinicId}/subscription/extend`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async auditLogs(params: SuperAdminAuditLogParams = {}): Promise<Paginated<AuditLogEntry>> {
    return apiFetch<Paginated<AuditLogEntry>>(
      `/super-admin/audit-logs${query({
        action: params.action,
        actor_user_id: params.actor_user_id,
        resource_type: params.resource_type,
        resource_id: params.resource_id,
        from: params.from,
        to: params.to,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async settings(): Promise<PlatformSettingsResponse> {
    return apiFetch<PlatformSettingsResponse>("/super-admin/settings");
  },

  async updateSetting(key: string, value: string): Promise<{ message: string; key: string; value: string }> {
    return apiFetch("/super-admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ key, value }),
    });
  },

  async statistics(): Promise<SuperAdminStatistics> {
    return apiFetch<SuperAdminStatistics>("/super-admin/statistics");
  },

  async superAdmins(): Promise<{ items: SuperAdminGrantItem[] }> {
    return apiFetch<{ items: SuperAdminGrantItem[] }>("/super-admin/super-admins");
  },

  async grantSuperAdmin(email: string): Promise<{ message: string; user_id: string; email: string }> {
    return apiFetch("/super-admin/super-admins", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async revokeSuperAdmin(userId: string): Promise<void> {
    return apiFetch<void>(`/super-admin/super-admins/${userId}`, { method: "DELETE" });
  },

  async plans(): Promise<{ items: SuperAdminPlanVersion[] }> {
    return apiFetch<{ items: SuperAdminPlanVersion[] }>("/super-admin/plans");
  },

  async publishPlan(input: {
    name?: string;
    monthly_amount: number;
    currency?: string;
    trial_months?: number;
  }): Promise<{
    message: string;
    plan_id: string;
    monthly_amount: number;
    currency: string;
    trial_months: number;
  }> {
    return apiFetch("/super-admin/plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async payments(
    params: {
      clinic_id?: string;
      status?: SubscriptionPaymentStatus;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<Paginated<SubscriptionPayment & { clinic_name?: string | null }>> {
    return apiFetch<Paginated<SubscriptionPayment & { clinic_name?: string | null }>>(
      `/super-admin/payments${query({
        clinic_id: params.clinic_id,
        status: params.status,
        from: params.from,
        to: params.to,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async processSubscriptions(): Promise<{
    message: string;
    result: { expiredTrials: number; expiredSubscriptions: number; expiringNotified: number };
  }> {
    return apiFetch("/super-admin/system/process-subscriptions", { method: "POST" });
  },
};

// ---------------------------------------------------------------------------
// Lab Tests — Clinic management
// ---------------------------------------------------------------------------

export interface LabTestListParams {
  clinic_id?: string;
  status?: LabTestStatus;
  category?: LabTestCategory;
  search?: string;
  limit?: number;
  cursor?: string;
}

export const labTestsApi = {
  async list(params: LabTestListParams = {}): Promise<Paginated<LabTest>> {
    return apiFetch<Paginated<LabTest>>(
      `/clinic/lab-tests${query({
        clinic_id: params.clinic_id,
        status: params.status,
        category: params.category,
        search: params.search,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async create(
    // name/code are optional — omit both to quick-create from just a category;
    // the backend derives them from it (see API.md).
    input: Omit<LabTest, "id" | "status" | "created_at" | "updated_at" | "name" | "code"> & {
      name?: string;
      code?: string;
    }
  ): Promise<LabTest> {
    return apiFetch<LabTest>("/clinic/lab-tests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(
    id: string,
    input: Partial<Omit<LabTest, "id" | "clinic_id" | "status" | "created_at" | "updated_at">>
  ): Promise<LabTest> {
    return apiFetch<LabTest>(`/clinic/lab-tests/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async toggleStatus(id: string, status: LabTestStatus): Promise<LabTest> {
    return apiFetch<LabTest>(`/clinic/lab-tests/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  // Distinct categories this clinic has already used — suggestions for the
  // create-form combobox, not an exhaustive/fixed list.
  async categories(clinicId?: string): Promise<{ items: LabTestCategoryOption[] }> {
    return apiFetch<{ items: LabTestCategoryOption[] }>(`/clinic/lab-tests/categories${query({ clinic_id: clinicId })}`);
  },

  // Bulk-register new categories (1-20 items, UPPER_SNAKE_CASE values).
  async createCategories(
    names: string[]
  ): Promise<{ created: LabTestCategoryOption[]; skipped?: LabTestCategoryOption[] }> {
    return apiFetch<{ created: LabTestCategoryOption[]; skipped?: LabTestCategoryOption[] }>(
      "/clinic/lab-tests/categories",
      { method: "POST", body: JSON.stringify({ categories: names }) }
    );
  },
};

// ---------------------------------------------------------------------------
// Lab Tests — Branch configuration
// ---------------------------------------------------------------------------

export const branchLabTestsApi = {
  async list(branchId: string, status?: LabTestStatus): Promise<{ items: BranchLabTest[] }> {
    return apiFetch<{ items: BranchLabTest[] }>(
      `/clinic/branches/${branchId}/lab-tests${query({ status })}`
    );
  },

  // Any authenticated user can call this (not clinic-scoped) - used by the
  // walk-in booking flow to find an open slot for a given date.
  async availability(
    branchId: string,
    branchTestId: string,
    date: string
  ): Promise<LabTestAvailabilityResponse> {
    return apiFetch<LabTestAvailabilityResponse>(
      `/branches/${branchId}/lab-tests/${branchTestId}/availability${query({ date })}`
    );
  },

  async configure(
    branchId: string,
    input: {
      test_id: string;
      price: number;
      currency: string;
      duration_minutes?: number;
      clinic_available?: boolean;
      home_collection_available?: boolean;
      prescription_required?: boolean;
    }
  ): Promise<BranchLabTest> {
    return apiFetch<BranchLabTest>(`/clinic/branches/${branchId}/lab-tests`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(
    branchId: string,
    id: string,
    input: Partial<{
      price: number;
      currency: string;
      duration_minutes: number;
      clinic_available: boolean;
      home_collection_available: boolean;
      prescription_required: boolean;
      status: LabTestStatus;
    }>
  ): Promise<BranchLabTest> {
    return apiFetch<BranchLabTest>(`/clinic/branches/${branchId}/lab-tests/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
};

// ---------------------------------------------------------------------------
// Lab Tests — Schedules
// ---------------------------------------------------------------------------

export const labTestSchedulesApi = {
  async list(branchId: string): Promise<{ items: LabTestSchedule[] }> {
    return apiFetch<{ items: LabTestSchedule[] }>(
      `/clinic/branches/${branchId}/lab-test-schedules`
    );
  },

  async create(
    branchId: string,
    input: {
      weekday: number;
      start_time: string;
      end_time: string;
      is_active?: boolean;
    }
  ): Promise<LabTestSchedule> {
    return apiFetch<LabTestSchedule>(`/clinic/branches/${branchId}/lab-test-schedules`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(
    branchId: string,
    id: string,
    input: Partial<{
      weekday: number;
      start_time: string;
      end_time: string;
      is_active: boolean;
    }>
  ): Promise<LabTestSchedule> {
    return apiFetch<LabTestSchedule>(
      `/clinic/branches/${branchId}/lab-test-schedules/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    );
  },

  async remove(branchId: string, id: string): Promise<void> {
    return apiFetch<void>(`/clinic/branches/${branchId}/lab-test-schedules/${id}`, {
      method: "DELETE",
    });
  },
};

// ---------------------------------------------------------------------------
// Lab Tests — Appointments (clinic management)
// ---------------------------------------------------------------------------

export interface LabTestAppointmentListParams {
  branch_id?: string;
  status?: LabTestAppointmentStatus;
  test_id?: string;
  service_mode?: LabTestAppointmentServiceMode;
  payment_status?: LabTestPaymentStatus;
  patient_name?: string;
  appointment_number?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  cursor?: string;
}

// PROPOSED contract for a staff-facing creation endpoint - does not exist on
// the backend yet. The only documented POST /lab-test-appointments is
// patient-only and has no patient_details-style field. This mirrors
// AppointmentCreateInput so the backend can add a matching
// POST /clinic/lab-test-appointments once ready.
export interface LabTestAppointmentCreateInput {
  branch_id: string;
  branch_lab_test_id: string;
  service_mode?: LabTestAppointmentServiceMode;
  appointment_date: string;
  start_time: string;
  payment_method?: LabTestPaymentMethod;
  patient_notes?: string;
  patient_details: LabTestAppointmentPatientDetailsInput;
}

export const labTestAppointmentsApi = {
  // PROPOSED — see LabTestAppointmentCreateInput above; POST /clinic/lab-test-appointments
  // does not exist on the backend yet.
  async create(
    input: LabTestAppointmentCreateInput,
    idempotencyKey: string
  ): Promise<LabTestAppointment> {
    return apiFetch<LabTestAppointment>("/clinic/lab-test-appointments", {
      method: "POST",
      body: JSON.stringify(input),
      idempotencyKey,
    });
  },

  async list(
    params: LabTestAppointmentListParams = {}
  ): Promise<Paginated<LabTestAppointment>> {
    return apiFetch<Paginated<LabTestAppointment>>(
      `/clinic/lab-test-appointments${query({
        branch_id: params.branch_id,
        status: params.status,
        test_id: params.test_id,
        service_mode: params.service_mode,
        payment_status: params.payment_status,
        patient_name: params.patient_name,
        appointment_number: params.appointment_number,
        date_from: params.date_from,
        date_to: params.date_to,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async get(id: string): Promise<LabTestAppointmentDetail> {
    return apiFetch<LabTestAppointmentDetail>(
      `/clinic/lab-test-appointments/${id}`
    );
  },

  async approve(
    id: string,
    input?: { precautions?: string[]; clinic_notes?: string }
  ): Promise<LabTestAppointment> {
    return apiFetch<LabTestAppointment>(
      `/clinic/lab-test-appointments/${id}/approve`,
      {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      }
    );
  },

  async reject(id: string, reason: string): Promise<LabTestAppointment> {
    return apiFetch<LabTestAppointment>(
      `/clinic/lab-test-appointments/${id}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      }
    );
  },

  async complete(id: string): Promise<LabTestAppointment> {
    return apiFetch<LabTestAppointment>(
      `/clinic/lab-test-appointments/${id}/complete`,
      { method: "POST" }
    );
  },

  async collectPayment(
    id: string,
    input: { reference_no?: string | null },
    idempotencyKey: string
  ): Promise<LabTestPayment> {
    return apiFetch<LabTestPayment>(
      `/clinic/lab-test-appointments/${id}/payment/collect`,
      {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      }
    );
  },

  async cancel(id: string, reason?: string): Promise<LabTestAppointment> {
    return apiFetch<LabTestAppointment>(
      `/lab-test-appointments/${id}/cancel`,
      {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      }
    );
  },
};

// ---------------------------------------------------------------------------
// Patients — self-service (patient role)
// ---------------------------------------------------------------------------

export interface PatientProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  gender: string | null;
  dob: string | null;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  created_at: string;
}

export interface PatientSession {
  id: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
}

export const patientsMeApi = {
  async get(): Promise<PatientProfile> {
    return apiFetch<PatientProfile>("/patients/me");
  },

  async update(input: Partial<{
    name: string;
    phone: string;
    photo_url: string;
    gender: string;
    dob: string;
    blood_group: string;
    allergies: string;
    chronic_conditions: string;
    current_medications: string;
  }>): Promise<PatientProfile> {
    return apiFetch<PatientProfile>("/patients/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async medicalInfo(): Promise<Record<string, unknown>> {
    return apiFetch<Record<string, unknown>>("/patients/me/medical-info");
  },

  async appointmentSummary(): Promise<{ items: Record<string, unknown>[] }> {
    return apiFetch<{ items: Record<string, unknown>[] }>("/patients/me/appointment-summary");
  },

  async changePassword(input: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/patients/me/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async changeEmailRequest(newEmail: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/patients/me/change-email/request", {
      method: "POST",
      body: JSON.stringify({ new_email: newEmail }),
    });
  },

  async changeEmailVerify(token: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/patients/me/change-email/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async sessions(): Promise<{ items: PatientSession[] }> {
    return apiFetch<{ items: PatientSession[] }>("/patients/me/sessions");
  },

  async revokeSession(sessionId: string): Promise<void> {
    return apiFetch<void>(`/patients/me/sessions/${sessionId}`, { method: "DELETE" });
  },

  async logoutAll(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/patients/me/sessions/logout-all", {
      method: "POST",
    });
  },

  async getPhotoUploadGrant(): Promise<PhotoUploadGrant> {
    return apiFetch<PhotoUploadGrant>("/patients/me/photo/signature", { method: "POST" });
  },

  async uploadPhoto(file: File): Promise<{ photo_url: string }> {
    const grant = await patientsMeApi.getPhotoUploadGrant();
    await uploadFileToCloudinary(grant, file);
    return apiFetch<{ photo_url: string }>("/patients/me/photo", {
      method: "POST",
      body: JSON.stringify({ public_id: grant.public_id }),
    });
  },
};

// ---------------------------------------------------------------------------
// Lab tests — patient browsing & booking (patient role)
// ---------------------------------------------------------------------------

export const patientLabTestsApi = {
  // Public: tests configured for a branch (price, availability flags).
  async listForBranch(
    branchId: string,
    params: { category?: LabTestCategory; search?: string; limit?: number; cursor?: string } = {}
  ): Promise<Paginated<BranchLabTest>> {
    return apiFetch<Paginated<BranchLabTest>>(
      `/branches/${branchId}/lab-tests${query({
        category: params.category,
        search: params.search,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async categoriesForBranch(branchId: string): Promise<{ items: LabTestCategoryOption[] }> {
    return apiFetch<{ items: LabTestCategoryOption[] }>(
      `/branches/${branchId}/lab-tests/categories`
    );
  },

  // Availability for a chosen date (slot capacity per service mode).
  async availability(branchId: string, input: { date: string }): Promise<{
    date: string;
    clinic_visit: { available: boolean; slots_remaining: number | null };
    home_collection: { available: boolean; slots_remaining: number | null };
  }> {
    return apiFetch(`/branches/${branchId}/lab-tests/availability`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // Patient books a lab test appointment.
  async book(input: {
    branch_id: string;
    test_id: string;
    service_mode: LabTestAppointmentServiceMode;
    preferred_date: string;
    preferred_slot: string | null;
    patient_name: string;
    patient_phone: string;
    patient_email?: string;
    address?: string | null;
    prescription_url?: string | null;
    notes?: string | null;
  }, idempotencyKey: string): Promise<LabTestAppointment> {
    return apiFetch<LabTestAppointment>("/lab-test-appointments", {
      method: "POST",
      body: JSON.stringify(input),
      idempotencyKey,
    });
  },

  async listMine(params: { status?: LabTestAppointmentStatus; limit?: number; cursor?: string } = {}): Promise<
    Paginated<LabTestAppointment>
  > {
    return apiFetch<Paginated<LabTestAppointment>>(
      `/lab-test-appointments${query({
        status: params.status,
        limit: params.limit,
        cursor: params.cursor,
      })}`
    );
  },

  async get(id: string): Promise<LabTestAppointmentDetail> {
    return apiFetch<LabTestAppointmentDetail>(`/lab-test-appointments/${id}`);
  },

  async pay(
    id: string,
    input: { provider_payment_id: string; provider_signature?: string | null; reference_no?: string | null },
    idempotencyKey: string
  ): Promise<LabTestPayment> {
    return apiFetch<LabTestPayment>(`/lab-test-appointments/${id}/payment`, {
      method: "POST",
      body: JSON.stringify(input),
      idempotencyKey,
    });
  },
};

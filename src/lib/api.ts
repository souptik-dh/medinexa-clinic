const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

import { BranchStaffPermission } from "@/lib/permissions";

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
}

export interface DoctorInviteAcceptResponse extends AuthTokens {
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

// POST /auth/clinic-owner/register leaves the account `pending` until the
// emailed verification link is followed, so unlike login it returns null
// tokens and a message instead of a usable session.
export interface ClinicOwnerRegisterResponse {
  user: User;
  access_token: string | null;
  refresh_token: string | null;
  clinic?: Clinic;
  message?: string;
}

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

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  if (typeof window === "undefined") return;
  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(USER_KEY);
  }
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

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
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
): Promise<void> {
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
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

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
  drug_license_number?: string | null;
  clinical_establishment_reg_number?: string | null;
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
  drug_license_number?: string | null;
  drug_license_url?: string | null;
  clinical_establishment_reg_number?: string | null;
  clinical_establishment_reg_url?: string | null;
  created_at: string;
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
  email: string;
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

export interface DoctorInviteCreateInput {
  name: string;
  specialization?: string | null;
  email: string;
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

export interface DoctorInvite {
  id: string;
  branch_id: string;
  name?: string | null;
  email: string;
  reg_no?: string | null;
  smc_name?: string | null;
  doctor_degree?: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at?: string;
}

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

export interface AppointmentCreateInput {
  doctor_id: string;
  branch_id: string;
  date: string;
  time: string;
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
  | "appointment_cancelled";

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
// Authentication
// ---------------------------------------------------------------------------

export const authApi = {
  async registerClinicOwner(input: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    clinicName?: string;
  }): Promise<ClinicOwnerRegisterResponse> {
    return apiFetch<ClinicOwnerRegisterResponse>("/auth/clinic-owner/register", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async verifyEmail(token: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
      skipAuth: true,
    });
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  async resetPassword(input: {
    token: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async acceptDoctorInvite(input: {
    email: string;
    invite_code: string;
    password: string;
    reg_no?: string;
  }): Promise<DoctorInviteAcceptResponse> {
    return apiFetch<DoctorInviteAcceptResponse>("/auth/doctor/accept-invite", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async loginClinicOwner(input: {
    email: string;
    password: string;
  }): Promise<ClinicOwnerAuthResponse> {
    return apiFetch<ClinicOwnerAuthResponse>("/auth/clinic-owner/login", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async loginDoctor(input: {
    email: string;
    password: string;
  }): Promise<DoctorAuthResponse> {
    return apiFetch<DoctorAuthResponse>("/auth/doctor/login", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  async branchStaffLogin(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/branch-staff/login", {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  async verifyStaffOtp(input: {
    email: string;
    otp: string;
  }): Promise<ClinicOwnerAuthResponse> {
    return apiFetch<ClinicOwnerAuthResponse>("/auth/branch-staff/verify-otp", {
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
    input: { name: string; email: string; permissions?: BranchStaffPermission[] }
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
  async create(branchId: string, input: DoctorInviteCreateInput): Promise<DoctorInvite> {
    return apiFetch<DoctorInvite>(`/branches/${branchId}/doctor-invites`, {
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
// Appointments
// ---------------------------------------------------------------------------

export interface AppointmentListParams {
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

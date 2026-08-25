import type { AppointmentStatus, NotificationType, PatientRelationship, LabTestAppointmentStatus, LabTestPaymentStatus, LabTestCategory, SubscriptionStatus, SubscriptionPaymentStatus } from "@/lib/api";
import type { BadgeColor as UiBadgeColor } from "@/components/ui/badge/Badge";

export function formatCurrency(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return formatDate(iso);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

export const appointmentStatusColor = (status: AppointmentStatus): UiBadgeColor => {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
      return "info";
    case "paid":
      return "primary";
    case "completed":
      return "success";
    case "cancelled":
      return "error";
    case "no_show":
      return "dark";
    default:
      return "light";
  }
};

export const appointmentStatusLabel = (status: AppointmentStatus): string => {
  switch (status) {
    case "no_show":
      return "No show";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

export const relationshipLabel = (relationship: PatientRelationship): string => {
  switch (relationship) {
    case "self":
      return "Self";
    default:
      return relationship.charAt(0).toUpperCase() + relationship.slice(1);
  }
};

export const notificationTypeLabel = (type: string): string => {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

export const notificationLink = (type: NotificationType): string => {
  switch (type) {
    case "new_booking":
    case "booking_confirmed":
    case "appointment_cancelled":
    case "consultation_completed":
      return "/appointments";
    case "payment_received":
      return "/ledger";
    case "prescription_ready":
      return "/prescriptions";
    case "doctor_invited":
      return "/doctors/invite";
    case "doctor_invite_accepted":
      return "/doctors";
    case "lab_test_booked":
    case "lab_test_approved":
    case "lab_test_rejected":
    case "lab_test_cancelled":
    case "lab_test_completed":
      return "/lab-test-appointments";
    default:
      return "/dashboard";
  }
};

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export const inviteStatusColor = (status: InviteStatus): UiBadgeColor => {
  switch (status) {
    case "pending":
      return "warning";
    case "accepted":
      return "success";
    case "expired":
      return "dark";
    case "revoked":
      return "error";
    default:
      return "light";
  }
};

export const inviteStatusLabel = (status: InviteStatus): string => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function today(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Adds `days` (can be negative) to a `YYYY-MM-DD` date string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

/** Formats a `Date` as a local `YYYY-MM-DD` string (no timezone conversion). */
export function formatDateISO(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function formatFullAddress(details: {
  address?: string | null;
  nearby_location?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  post_office?: string | null;
  pin_code?: string | null;
}): string {
  return [
    details.address && `Address: ${details.address}`,
    details.nearby_location && `Nearby location: ${details.nearby_location}`,
    details.city && `City: ${details.city}`,
    details.district && `District: ${details.district}`,
    details.state && `State: ${details.state}`,
    details.post_office && `Post office: ${details.post_office}`,
    details.pin_code && `Pincode: ${details.pin_code}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Lab Test utilities
// ---------------------------------------------------------------------------

export const labTestAppointmentStatusColor = (status: LabTestAppointmentStatus): UiBadgeColor => {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "info";
    case "REJECTED":
      return "error";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "dark";
    default:
      return "light";
  }
};

export const labTestAppointmentStatusLabel = (status: LabTestAppointmentStatus): string => {
  return status.charAt(0) + status.slice(1).toLowerCase();
};

export const labTestPaymentStatusLabel = (status: LabTestPaymentStatus): string => {
  return status.charAt(0) + status.slice(1).toLowerCase();
};

export const labTestPaymentStatusColor = (status: LabTestPaymentStatus): UiBadgeColor => {
  switch (status) {
    case "PAID":
      return "success";
    case "PENDING":
      return "warning";
    case "UNPAID":
      return "dark";
    case "REFUNDED":
      return "info";
    case "FAILED":
      return "error";
    default:
      return "light";
  }
};

export const labTestCategoryLabel = (category: LabTestCategory): string => {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------------------------------------------------------------------
// Subscription utilities
// ---------------------------------------------------------------------------

export const subscriptionStatusColor = (status: SubscriptionStatus): UiBadgeColor => {
  switch (status) {
    case "TRIAL":
      return "info";
    case "ACTIVE":
      return "success";
    case "EXPIRING":
      return "warning";
    case "EXPIRED":
      return "error";
    case "INACTIVE":
      return "dark";
    default:
      return "light";
  }
};

export const subscriptionStatusLabel = (status: SubscriptionStatus): string => {
  switch (status) {
    case "TRIAL":
      return "Free trial";
    case "EXPIRING":
      return "Expiring soon";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
};

export const subscriptionPaymentStatusColor = (status: SubscriptionPaymentStatus): UiBadgeColor => {
  switch (status) {
    case "PAID":
      return "success";
    case "PENDING":
      return "warning";
    case "FAILED":
      return "error";
    default:
      return "light";
  }
};

export const BRANCH_STAFF_PERMISSIONS = [
  "appointments:confirm",
  "appointments:payment",
  "appointments:complete",
  "appointments:cancel",
  "staff:manage",
  "doctors:manage",
] as const;

export type BranchStaffPermission = (typeof BRANCH_STAFF_PERMISSIONS)[number];

export const DEFAULT_BRANCH_STAFF_PERMISSIONS: readonly BranchStaffPermission[] = [
  "appointments:confirm",
  "appointments:payment",
  "appointments:complete",
  "appointments:cancel",
];

export const BRANCH_STAFF_PERMISSION_META: {
  permission: BranchStaffPermission;
  module: "appointments" | "staff" | "doctors";
  label: string;
  description: string;
}[] = [
  {
    permission: "appointments:confirm",
    module: "appointments",
    label: "Confirm",
    description: "Mark pending appointments as confirmed",
  },
  {
    permission: "appointments:payment",
    module: "appointments",
    label: "Payment",
    description: "Record payments on confirmed appointments",
  },
  {
    permission: "appointments:complete",
    module: "appointments",
    label: "Complete",
    description: "Mark paid appointments as completed",
  },
  {
    permission: "appointments:cancel",
    module: "appointments",
    label: "Cancel",
    description: "Cancel pending, confirmed, or paid appointments",
  },
  {
    permission: "staff:manage",
    module: "staff",
    label: "Manage staff",
    description: "Add, remove, and configure staff members",
  },
  {
    permission: "doctors:manage",
    module: "doctors",
    label: "Manage doctors",
    description: "Invite, edit, and remove doctors on the branch",
  },
];

export const BRANCH_STAFF_PERMISSION_MODULES = [
  { module: "appointments" as const, label: "Appointments" },
  { module: "staff" as const, label: "Staff" },
  { module: "doctors" as const, label: "Doctors" },
];

export function hasPermission(
  permissions: readonly BranchStaffPermission[] | undefined,
  key: BranchStaffPermission
): boolean {
  return permissions?.includes(key) ?? false;
}

export function canAccessAppointments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return (
    hasPermission(permissions, "appointments:confirm") ||
    hasPermission(permissions, "appointments:payment") ||
    hasPermission(permissions, "appointments:complete") ||
    hasPermission(permissions, "appointments:cancel")
  );
}

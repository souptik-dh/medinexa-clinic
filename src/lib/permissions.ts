export const BRANCH_STAFF_PERMISSIONS = [
  "appointments:confirm",
  "appointments:payment",
  "appointments:complete",
  "appointments:cancel",
  "staff:manage",
  "doctors:manage",
  "patients:view",
  "reviews:view",
  "clinics:manage",
  "clinic:create",
  "clinic:delete",
  "clinic:update",
  "clinic:reports",
  "clinic:analytics",
  "branch:settings",
  "branch:reports",
  "branch:analytics",
  "branch:delete",
  "branch:create",
  "branch:update",
  "lab_tests:manage",
  "lab_appointments:view",
  "lab_appointments:approve",
  "lab_appointments:reject",
  "lab_appointments:cancel",
  "lab_appointments:complete",
  "lab_payments:view",
  "lab_payments:collect",
  "lab_prescriptions:view",
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
  module: "appointments" | "staff" | "doctors" | "patients" | "clinics" | "branch" | "lab_tests";
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
  {
    permission: "patients:view",
    module: "patients",
    label: "View patients",
    description: "View the branch patient list",
  },
  {
    permission: "reviews:view",
    module: "patients",
    label: "View reviews",
    description: "View patient ratings and reviews for the branch's doctors",
  },
  {
    permission: "clinics:manage",
    module: "clinics",
    label: "Manage clinics",
    description: "View all clinics and their branches",
  },
  {
    permission: "clinic:create",
    module: "clinics",
    label: "Create clinic",
    description: "Create new clinics",
  },
  {
    permission: "clinic:delete",
    module: "clinics",
    label: "Delete clinic",
    description: "Delete clinics",
  },
  {
    permission: "clinic:update",
    module: "clinics",
    label: "Update clinic",
    description: "Update clinic details",
  },
  {
    permission: "clinic:reports",
    module: "clinics",
    label: "Clinic reports",
    description: "View clinic reports and analytics",
  },
  {
    permission: "clinic:analytics",
    module: "clinics",
    label: "Clinic analytics",
    description: "Access clinic analytics and insights",
  },
  {
    permission: "branch:settings",
    module: "branch",
    label: "Branch settings",
    description: "Modify branch settings and configuration",
  },
  {
    permission: "branch:reports",
    module: "branch",
    label: "Branch reports",
    description: "View branch reports and analytics",
  },
  {
    permission: "branch:analytics",
    module: "branch",
    label: "Branch analytics",
    description: "Access branch analytics and insights",
  },
  {
    permission: "branch:delete",
    module: "branch",
    label: "Delete branch",
    description: "Delete branches",
  },
  {
    permission: "branch:create",
    module: "branch",
    label: "Create branch",
    description: "Create new branches",
  },
  {
    permission: "branch:update",
    module: "branch",
    label: "Update branch",
    description: "Update branch details",
  },
  {
    permission: "lab_tests:manage",
    module: "lab_tests",
    label: "Manage lab tests",
    description: "Create, edit, and configure lab tests",
  },
  {
    permission: "lab_appointments:view",
    module: "lab_tests",
    label: "View lab appointments",
    description: "View lab test appointments",
  },
  {
    permission: "lab_appointments:approve",
    module: "lab_tests",
    label: "Approve lab appointments",
    description: "Approve pending lab test appointments",
  },
  {
    permission: "lab_appointments:reject",
    module: "lab_tests",
    label: "Reject lab appointments",
    description: "Reject pending lab test appointments",
  },
  {
    permission: "lab_appointments:cancel",
    module: "lab_tests",
    label: "Cancel lab appointments",
    description: "Cancel pending or approved lab test appointments",
  },
  {
    permission: "lab_appointments:complete",
    module: "lab_tests",
    label: "Complete lab appointments",
    description: "Mark approved lab test appointments as completed",
  },
  {
    permission: "lab_payments:view",
    module: "lab_tests",
    label: "View lab payments",
    description: "View payment records for lab test appointments",
  },
  {
    permission: "lab_payments:collect",
    module: "lab_tests",
    label: "Collect lab payments",
    description: "Collect payments for lab test appointments",
  },
  {
    permission: "lab_prescriptions:view",
    module: "lab_tests",
    label: "View lab prescriptions",
    description: "View prescriptions uploaded for lab test appointments",
  },
];

export const BRANCH_STAFF_PERMISSION_MODULES = [
  { module: "appointments" as const, label: "Appointments" },
  { module: "staff" as const, label: "Staff" },
  { module: "doctors" as const, label: "Doctors" },
  { module: "patients" as const, label: "Patients" },
  { module: "clinics" as const, label: "Clinics" },
  { module: "branch" as const, label: "Branch" },
  { module: "lab_tests" as const, label: "Lab Tests" },
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

export function canViewPatients(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "patients:view");
}

export function canViewReviews(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "reviews:view");
}

export function canManageClinics(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "clinics:manage");
}

export function canCreateClinic(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "clinic:create");
}

export function canDeleteClinic(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "clinic:delete");
}

export function canUpdateClinic(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "clinic:update");
}

export function canViewClinicReports(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "clinic:reports");
}

export function canViewClinicAnalytics(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "clinic:analytics");
}

export function canManageBranch(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return (
    hasPermission(permissions, "branch:settings") ||
    hasPermission(permissions, "branch:create") ||
    hasPermission(permissions, "branch:update") ||
    hasPermission(permissions, "branch:delete")
  );
}

export function canCreateBranch(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "branch:create");
}

export function canUpdateBranch(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "branch:update");
}

export function canDeleteBranch(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "branch:delete");
}

export function canViewBranchReports(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "branch:reports");
}

export function canViewBranchAnalytics(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "branch:analytics");
}

export function canAccessBranchSettings(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "branch:settings");
}

export function canManageLabTests(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_tests:manage");
}

export function canViewLabAppointments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_appointments:view");
}

export function canApproveLabAppointments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_appointments:approve");
}

export function canRejectLabAppointments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_appointments:reject");
}

export function canCancelLabAppointments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_appointments:cancel");
}

export function canCompleteLabAppointments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_appointments:complete");
}

export function canViewLabPayments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_payments:view");
}

export function canCollectLabPayments(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_payments:collect");
}

export function canViewLabPrescriptions(
  permissions: readonly BranchStaffPermission[] | undefined
): boolean {
  return hasPermission(permissions, "lab_prescriptions:view");
}

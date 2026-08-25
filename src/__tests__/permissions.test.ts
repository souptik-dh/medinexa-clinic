import { describe, it, expect } from "vitest";
import {
  BRANCH_STAFF_PERMISSIONS,
  DEFAULT_BRANCH_STAFF_PERMISSIONS,
  BRANCH_STAFF_PERMISSION_META,
  BRANCH_STAFF_PERMISSION_MODULES,
  hasPermission,
  canAccessAppointments,
  canViewPatients,
  canViewReviews,
  canManageClinics,
  canCreateClinic,
  canDeleteClinic,
  canUpdateClinic,
  canViewClinicReports,
  canViewClinicAnalytics,
  canManageBranch,
  canCreateBranch,
  canUpdateBranch,
  canDeleteBranch,
  canViewBranchReports,
  canViewBranchAnalytics,
  canAccessBranchSettings,
} from "@/lib/permissions";

describe("BRANCH_STAFF_PERMISSIONS", () => {
  it("contains exactly 21 permissions", () => {
    expect(BRANCH_STAFF_PERMISSIONS).toHaveLength(21);
  });

  it("contains unique permissions", () => {
    const unique = new Set(BRANCH_STAFF_PERMISSIONS);
    expect(unique.size).toBe(BRANCH_STAFF_PERMISSIONS.length);
  });

  it("all permissions follow module:action format", () => {
    for (const perm of BRANCH_STAFF_PERMISSIONS) {
      expect(perm).toMatch(/^[a-z]+:[a-z_]+$/);
    }
  });
});

describe("DEFAULT_BRANCH_STAFF_PERMISSIONS", () => {
  it("contains 5 default permissions", () => {
    expect(DEFAULT_BRANCH_STAFF_PERMISSIONS).toHaveLength(5);
  });

  it("all defaults are appointment-related", () => {
    for (const perm of DEFAULT_BRANCH_STAFF_PERMISSIONS) {
      expect(perm).toMatch(/^appointments:/);
    }
  });

  it("all defaults are valid BRANCH_STAFF_PERMISSIONS", () => {
    for (const perm of DEFAULT_BRANCH_STAFF_PERMISSIONS) {
      expect(BRANCH_STAFF_PERMISSIONS).toContain(perm);
    }
  });
});

describe("BRANCH_STAFF_PERMISSION_META", () => {
  it("has metadata for every permission", () => {
    expect(BRANCH_STAFF_PERMISSION_META).toHaveLength(BRANCH_STAFF_PERMISSIONS.length);
  });

  it("each meta entry has required fields", () => {
    for (const meta of BRANCH_STAFF_PERMISSION_META) {
      expect(meta.permission).toBeDefined();
      expect(meta.module).toBeDefined();
      expect(meta.label).toBeDefined();
      expect(meta.description).toBeDefined();
      expect(typeof meta.label).toBe("string");
      expect(typeof meta.description).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("each meta permission is in BRANCH_STAFF_PERMISSIONS", () => {
    for (const meta of BRANCH_STAFF_PERMISSION_META) {
      expect(BRANCH_STAFF_PERMISSIONS).toContain(meta.permission);
    }
  });

  it("reviews:view is classified under 'patients' module", () => {
    const reviewsMeta = BRANCH_STAFF_PERMISSION_META.find(
      (m) => m.permission === "reviews:view"
    );
    expect(reviewsMeta?.module).toBe("patients");
  });
});

describe("BRANCH_STAFF_PERMISSION_MODULES", () => {
  it("contains 6 modules", () => {
    expect(BRANCH_STAFF_PERMISSION_MODULES).toHaveLength(6);
  });

  it("has unique module keys", () => {
    const modules = BRANCH_STAFF_PERMISSION_MODULES.map((m) => m.module);
    const unique = new Set(modules);
    expect(unique.size).toBe(modules.length);
  });
});

describe("hasPermission", () => {
  it("returns true when permission is present", () => {
    expect(hasPermission(["appointments:confirm"], "appointments:confirm")).toBe(true);
  });

  it("returns false when permission is absent", () => {
    expect(hasPermission(["appointments:confirm"], "patients:view")).toBe(false);
  });

  it("returns false for undefined permissions", () => {
    expect(hasPermission(undefined, "appointments:confirm")).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasPermission([], "appointments:confirm")).toBe(false);
  });
});

describe("canAccessAppointments", () => {
  it("returns true when any appointment permission is present", () => {
    expect(canAccessAppointments(["appointments:create"])).toBe(true);
    expect(canAccessAppointments(["appointments:confirm"])).toBe(true);
    expect(canAccessAppointments(["appointments:payment"])).toBe(true);
    expect(canAccessAppointments(["appointments:complete"])).toBe(true);
    expect(canAccessAppointments(["appointments:cancel"])).toBe(true);
  });

  it("returns false when no appointment permissions", () => {
    expect(canAccessAppointments(["patients:view"])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canAccessAppointments(undefined)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(canAccessAppointments([])).toBe(false);
  });
});

describe("canViewPatients", () => {
  it("returns true with patients:view", () => {
    expect(canViewPatients(["patients:view"])).toBe(true);
  });

  it("returns false without patients:view", () => {
    expect(canViewPatients(["appointments:confirm"])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canViewPatients(undefined)).toBe(false);
  });
});

describe("canViewReviews", () => {
  it("returns true with reviews:view", () => {
    expect(canViewReviews(["reviews:view"])).toBe(true);
  });

  it("returns false without reviews:view", () => {
    expect(canViewReviews(["patients:view"])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canViewReviews(undefined)).toBe(false);
  });
});

describe("canManageClinics", () => {
  it("returns true with clinics:manage", () => {
    expect(canManageClinics(["clinics:manage"])).toBe(true);
  });

  it("returns false without clinics:manage", () => {
    expect(canManageClinics(["clinic:create"])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canManageClinics(undefined)).toBe(false);
  });
});

describe("canCreateClinic", () => {
  it("returns true with clinic:create", () => {
    expect(canCreateClinic(["clinic:create"])).toBe(true);
  });

  it("returns false without clinic:create", () => {
    expect(canCreateClinic(["clinics:manage"])).toBe(false);
  });
});

describe("canDeleteClinic", () => {
  it("returns true with clinic:delete", () => {
    expect(canDeleteClinic(["clinic:delete"])).toBe(true);
  });

  it("returns false without clinic:delete", () => {
    expect(canDeleteClinic(["clinics:manage"])).toBe(false);
  });
});

describe("canUpdateClinic", () => {
  it("returns true with clinic:update", () => {
    expect(canUpdateClinic(["clinic:update"])).toBe(true);
  });

  it("returns false without clinic:update", () => {
    expect(canUpdateClinic(["clinics:manage"])).toBe(false);
  });
});

describe("canViewClinicReports", () => {
  it("returns true with clinic:reports", () => {
    expect(canViewClinicReports(["clinic:reports"])).toBe(true);
  });

  it("returns false without clinic:reports", () => {
    expect(canViewClinicReports(["clinic:analytics"])).toBe(false);
  });
});

describe("canViewClinicAnalytics", () => {
  it("returns true with clinic:analytics", () => {
    expect(canViewClinicAnalytics(["clinic:analytics"])).toBe(true);
  });

  it("returns false without clinic:analytics", () => {
    expect(canViewClinicAnalytics(["clinic:reports"])).toBe(false);
  });
});

describe("canManageBranch", () => {
  it("returns true with any branch management permission", () => {
    expect(canManageBranch(["branch:settings"])).toBe(true);
    expect(canManageBranch(["branch:create"])).toBe(true);
    expect(canManageBranch(["branch:update"])).toBe(true);
    expect(canManageBranch(["branch:delete"])).toBe(true);
  });

  it("returns false when only branch:reports", () => {
    expect(canManageBranch(["branch:reports"])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canManageBranch(undefined)).toBe(false);
  });
});

describe("canCreateBranch", () => {
  it("returns true with branch:create", () => {
    expect(canCreateBranch(["branch:create"])).toBe(true);
  });

  it("returns false without branch:create", () => {
    expect(canCreateBranch(["branch:update"])).toBe(false);
  });
});

describe("canUpdateBranch", () => {
  it("returns true with branch:update", () => {
    expect(canUpdateBranch(["branch:update"])).toBe(true);
  });

  it("returns false without branch:update", () => {
    expect(canUpdateBranch(["branch:create"])).toBe(false);
  });
});

describe("canDeleteBranch", () => {
  it("returns true with branch:delete", () => {
    expect(canDeleteBranch(["branch:delete"])).toBe(true);
  });

  it("returns false without branch:delete", () => {
    expect(canDeleteBranch(["branch:create"])).toBe(false);
  });
});

describe("canViewBranchReports", () => {
  it("returns true with branch:reports", () => {
    expect(canViewBranchReports(["branch:reports"])).toBe(true);
  });

  it("returns false without branch:reports", () => {
    expect(canViewBranchReports(["branch:analytics"])).toBe(false);
  });
});

describe("canViewBranchAnalytics", () => {
  it("returns true with branch:analytics", () => {
    expect(canViewBranchAnalytics(["branch:analytics"])).toBe(true);
  });

  it("returns false without branch:analytics", () => {
    expect(canViewBranchAnalytics(["branch:reports"])).toBe(false);
  });
});

describe("canAccessBranchSettings", () => {
  it("returns true with branch:settings", () => {
    expect(canAccessBranchSettings(["branch:settings"])).toBe(true);
  });

  it("returns false without branch:settings", () => {
    expect(canAccessBranchSettings(["branch:create"])).toBe(false);
  });
});

import type { AiUser, ToolCall, ToolResult } from "./types";
import { getToolById } from "./tools";
import { hasPermission, type BranchStaffPermission } from "@/lib/permissions";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (res.status === 204) return { success: true };

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg =
        body?.error?.message ?? `API returned ${res.status}`;
      throw new Error(errMsg);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function hasRequiredPermission(
  user: AiUser,
  permission: BranchStaffPermission
): boolean {
  if (user.role === "clinic_owner" || user.role === "sys_admin") return true;
  if (user.role === "branch_staff") {
    return hasPermission(user.permissions ?? [], permission);
  }
  return false;
}

function hasRequiredRole(user: AiUser, roles?: string[]): boolean {
  if (!roles || roles.length === 0) return true;
  return roles.includes(user.role);
}

/**
 * Clamps a clinic scope to the caller's own clinic. Only sys_admin may
 * cross clinic boundaries (e.g. by passing an explicit clinicId param) -
 * every other role is always pinned to their own clinicId, regardless of
 * what a tool parameter requests.
 */
function resolveClinicId(user: AiUser, requestedClinicId?: unknown): string | undefined {
  if (user.role === "sys_admin") {
    return (requestedClinicId as string | undefined) ?? user.clinicId ?? undefined;
  }
  return user.clinicId ?? undefined;
}

/**
 * Clamps a branch scope to the caller's own branch. branch_staff and
 * doctor accounts are always pinned to their own branchId - a requested
 * branchId param is ignored for them so they can't escalate into another
 * branch's data by simply passing a different ID. clinic_owner/sys_admin
 * may target any branch (their own clinic scope is enforced separately).
 */
function resolveBranchId(user: AiUser, requestedBranchId?: unknown): string | undefined {
  if (user.role === "branch_staff" || user.role === "doctor") {
    return user.branchId ?? undefined;
  }
  return (requestedBranchId as string | undefined) ?? user.branchId ?? undefined;
}

export function checkToolPermissions(
  user: AiUser,
  toolId: string
): { allowed: boolean; reason?: string } {
  const tool = getToolById(toolId);
  if (!tool) {
    return { allowed: false, reason: `Unknown tool: ${toolId}` };
  }

  if (tool.requiredRole && !hasRequiredRole(user, tool.requiredRole)) {
    return {
      allowed: false,
      reason: `This action requires one of these roles: ${tool.requiredRole.join(", ")}. Your role: ${user.role}`,
    };
  }

  if (tool.requiredPermissions && tool.requiredPermissions.length > 0) {
    const missing = tool.requiredPermissions.filter(
      (p) => !hasRequiredPermission(user, p)
    );
    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `Missing required permissions: ${missing.join(", ")}`,
      };
    }
  }

  return { allowed: true };
}

interface ToolHandler {
  (
    user: AiUser,
    params: Record<string, unknown>,
    token?: string
  ): Promise<unknown>;
}

const toolHandlers: Record<string, ToolHandler> = {
  search_appointments: async (user, params, token) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", String(params.status));
    if (params.date) {
      const d = String(params.date);
      if (d === "today") {
        q.set("date_from", new Date().toISOString().split("T")[0]);
        q.set("date_to", new Date().toISOString().split("T")[0]);
      } else if (d === "tomorrow") {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        const ds = t.toISOString().split("T")[0];
        q.set("date_from", ds);
        q.set("date_to", ds);
      } else {
        q.set("date_from", d);
        q.set("date_to", d);
      }
    }
    const clinicId = resolveClinicId(user);
    const branchId = resolveBranchId(user);
    if (clinicId) q.set("clinic_id", clinicId);
    if (branchId) q.set("branch_id", branchId);
    q.set("limit", String(params.limit ?? 20));
    return apiRequest(`/appointments?${q}`, {}, token);
  },

  get_appointment_details: async (_user, params, token) => {
    return apiRequest(`/appointments/${params.appointmentId}`, {}, token);
  },

  search_patients: async (user, params, token) => {
    const branchId = user.branchId;
    if (!branchId) return { items: [], message: "No branch context available" };
    const q = new URLSearchParams();
    if (params.query) q.set("search", String(params.query));
    q.set("limit", String(params.limit ?? 20));
    return apiRequest(`/branches/${branchId}/patients?${q}`, {}, token);
  },

  search_doctors: async (user, params, token) => {
    if (params.query) {
      return apiRequest(`/doctors/search?q=${encodeURIComponent(String(params.query))}`, {}, token);
    }
    const branchId = params.branchId ?? user.branchId;
    if (branchId) {
      return apiRequest(`/branches/${branchId}/doctors`, {}, token);
    }
    return apiRequest(`/doctors`, {}, token);
  },

  search_clinics: async (_user, params, token) => {
    const q = new URLSearchParams();
    if (params.query) q.set("search", String(params.query));
    return apiRequest(`/clinics?${q}`, {}, token);
  },

  search_branches: async (user, params, token) => {
    const clinicId = resolveClinicId(user, params.clinicId);
    if (clinicId) {
      return apiRequest(`/clinics/${clinicId}/branches`, {}, token);
    }
    return apiRequest(`/branches`, {}, token);
  },

  search_lab_tests: async (_user, params, token) => {
    const q = new URLSearchParams();
    if (params.query) q.set("search", String(params.query));
    if (params.category) q.set("category", String(params.category));
    return apiRequest(`/clinic/lab-tests?${q}`, {}, token);
  },

  get_notifications: async (_user, params, token) => {
    const q = new URLSearchParams();
    if (params.unreadOnly) q.set("unread_only", "true");
    q.set("limit", String(params.limit ?? 20));
    return apiRequest(`/notifications?${q}`, {}, token);
  },

  get_subscription: async (user, _params, token) => {
    const clinicId = user.clinicId;
    if (!clinicId) return { message: "No clinic context available" };
    return apiRequest(`/clinics/${clinicId}/subscription`, {}, token);
  },

  get_prescriptions: async (_user, params, token) => {
    if (params.appointmentId) {
      return apiRequest(`/appointments/${params.appointmentId}/prescription`, {}, token);
    }
    return { message: "Please specify an appointment ID to look up its prescription." };
  },

  get_lab_test_appointments: async (user, params, token) => {
    const q = new URLSearchParams();
    if (user.branchId) q.set("branch_id", user.branchId);
    if (params.status) q.set("status", String(params.status));
    q.set("limit", String(params.limit ?? 20));
    return apiRequest(`/clinic/lab-test-appointments?${q}`, {}, token);
  },

  get_dashboard_stats: async (user, params, token) => {
    // Must stay clinic/branch-scoped - this tool is available to clinic
    // owners and permitted staff, so it must never reach the super-admin
    // statistics endpoint (that one is platform-wide and sys_admin-only;
    // see get_platform_stats).
    return toolHandlers.get_business_summary(user, params, token);
  },

  get_reviews: async (user, params, token) => {
    if (params.doctorId) {
      return apiRequest(`/doctors/${params.doctorId}/reviews`, {}, token);
    }
    const branchId = resolveBranchId(user, params.branchId);
    if (branchId) {
      return apiRequest(`/branches/${branchId}/reviews`, {}, token);
    }
    return { items: [], message: "Please specify a doctor or branch to look up reviews." };
  },

  get_staff_list: async (user, params, token) => {
    const branchId = resolveBranchId(user, params.branchId);
    const canSeeOtherBranches = user.role === "clinic_owner" || user.role === "sys_admin";

    if (branchId) {
      const result = await apiRequest(`/branches/${branchId}/staff`, {}, token) as Record<string, unknown>;
      const items = result?.items ?? result?.staff ?? [];
      if (Array.isArray(items) && items.length > 0) return result;

      if (canSeeOtherBranches && user.clinicId) {
        const branchesRes = await apiRequest(`/clinics/${user.clinicId}/branches?limit=50`, {}, token) as Record<string, unknown>;
        const branches = (branchesRes?.items ?? []) as { id: string; name?: string }[];
        const allStaff: unknown[] = [];
        for (const branch of branches) {
          try {
            const branchStaff = await apiRequest(`/branches/${branch.id}/staff`, {}, token) as Record<string, unknown>;
            const staffItems = branchStaff?.items ?? branchStaff?.staff ?? [];
            if (Array.isArray(staffItems)) {
              for (const s of staffItems) {
                allStaff.push({ ...(s as Record<string, unknown>), _branch_name: branch.name });
              }
            }
          } catch {
            // Skip branches we can't access
          }
        }
        if (allStaff.length > 0) return { items: allStaff };
      }
      return result;
    }

    if (canSeeOtherBranches && user.clinicId) {
      const branchesRes = await apiRequest(`/clinics/${user.clinicId}/branches?limit=50`, {}, token) as Record<string, unknown>;
      const branches = (branchesRes?.items ?? []) as { id: string; name?: string }[];
      const allStaff: unknown[] = [];
      for (const branch of branches) {
        try {
          const branchStaff = await apiRequest(`/branches/${branch.id}/staff`, {}, token) as Record<string, unknown>;
          const staffItems = branchStaff?.items ?? branchStaff?.staff ?? [];
          if (Array.isArray(staffItems)) {
            for (const s of staffItems) {
              allStaff.push({ ...(s as Record<string, unknown>), _branch_name: branch.name });
            }
          }
        } catch {
          // Skip
        }
      }
      if (allStaff.length > 0) return { items: allStaff };
    }

    return { items: [], message: "No branch context available" };
  },

  get_branch_schedule: async (user, params, token) => {
    const branchId = resolveBranchId(user, params.branchId);
    if (!branchId) return { message: "No branch context available" };
    return apiRequest(`/branches/${branchId}/schedule`, {}, token);
  },

  get_ledger: async (user, params, token) => {
    const clinicId = user.clinicId;
    if (!clinicId) return { message: "No clinic context available" };
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    return apiRequest(`/clinics/${clinicId}/ledger?${q}`, {}, token);
  },

  get_audit_logs: async (_user, params, token) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    return apiRequest(`/super-admin/audit-logs?${q}`, {}, token);
  },

  get_platform_stats: async (_user, _params, token) => {
    return apiRequest("/super-admin/statistics", {}, token);
  },

  // ─── Report handlers ─────────────────────────────────────────

  get_sales_report: async (user, params, token) => {
    const period = String(params.period ?? "monthly");
    const now = new Date();
    let dateFrom: string;
    let dateTo: string;

    if (params.dateFrom && params.dateTo) {
      dateFrom = String(params.dateFrom);
      dateTo = String(params.dateTo);
    } else {
      switch (period) {
        case "today": {
          const d = now.toISOString().split("T")[0];
          dateFrom = d;
          dateTo = d;
          break;
        }
        case "weekly": {
          const start = new Date(now);
          start.setDate(now.getDate() - now.getDay());
          dateFrom = start.toISOString().split("T")[0];
          dateTo = now.toISOString().split("T")[0];
          break;
        }
        case "quarterly": {
          const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          dateFrom = start.toISOString().split("T")[0];
          dateTo = now.toISOString().split("T")[0];
          break;
        }
        case "yearly": {
          dateFrom = `${now.getFullYear()}-01-01`;
          dateTo = now.toISOString().split("T")[0];
          break;
        }
        default: {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFrom = start.toISOString().split("T")[0];
          dateTo = now.toISOString().split("T")[0];
          break;
        }
      }
    }

    const clinicId = resolveClinicId(user, params.clinicId);
    const branchId = resolveBranchId(user, params.branchId);

    const q = new URLSearchParams();
    q.set("date_from", dateFrom);
    q.set("date_to", dateTo);
    q.set("limit", "200");
    if (clinicId) q.set("clinic_id", String(clinicId));
    if (branchId) q.set("branch_id", String(branchId));

    const appointRes = await apiRequest(`/appointments?${q}`, {}, token) as Record<string, unknown>;
    const appointments = (appointRes?.items ?? []) as Record<string, unknown>[];

    const labQ = new URLSearchParams();
    labQ.set("date_from", dateFrom);
    labQ.set("date_to", dateTo);
    labQ.set("limit", "200");
    if (branchId) labQ.set("branch_id", String(branchId));

    let labAppointments: Record<string, unknown>[] = [];
    try {
      const labRes = await apiRequest(`/clinic/lab-test-appointments?${labQ}`, {}, token) as Record<string, unknown>;
      labAppointments = (labRes?.items ?? []) as Record<string, unknown>[];
    } catch {
      // Non-fatal - user may not have lab test access
    }

    let totalAppointmentRevenue = 0;
    let totalLabRevenue = 0;
    const byStatus: Record<string, number> = {};
    const byPaymentMethod: Record<string, number> = {};
    const byDay: Record<string, { revenue: number; count: number }> = {};
    const byBranch: Record<string, { revenue: number; count: number }> = {};

    for (const a of appointments) {
      const fee = Number(a.fee_amount ?? 0);
      const status = String(a.status ?? "unknown");
      const method = String(a.payment_method ?? "unknown");
      const date = String(a.scheduled_date ?? "").split("T")[0];
      const bName = String(a.branch_name ?? a._branch_name ?? "Unknown");

      if (status === "completed" || status === "paid") {
        totalAppointmentRevenue += fee;
      }

      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (method !== "unknown" && (status === "completed" || status === "paid")) {
        byPaymentMethod[method] = (byPaymentMethod[method] ?? 0) + fee;
      }
      if (date) {
        if (!byDay[date]) byDay[date] = { revenue: 0, count: 0 };
        byDay[date].count++;
        if (status === "completed" || status === "paid") byDay[date].revenue += fee;
      }
      if (bName !== "Unknown") {
        if (!byBranch[bName]) byBranch[bName] = { revenue: 0, count: 0 };
        byBranch[bName].count++;
        if (status === "completed" || status === "paid") byBranch[bName].revenue += fee;
      }
    }

    for (const lt of labAppointments) {
      const price = Number(lt.price ?? 0);
      const pStatus = String(lt.payment_status ?? "unknown");
      if (pStatus === "PAID") {
        totalLabRevenue += price;
      }
    }

    return {
      period,
      dateFrom,
      dateTo,
      totalAppointmentRevenue,
      totalLabRevenue,
      totalRevenue: totalAppointmentRevenue + totalLabRevenue,
      totalAppointments: appointments.length,
      totalLabAppointments: labAppointments.length,
      byStatus,
      byPaymentMethod,
      byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(0, 30),
      byBranch: Object.entries(byBranch).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue),
    };
  },

  get_patient_report: async (user, params, token) => {
    const period = String(params.period ?? "monthly");
    const branchId = resolveBranchId(user, params.branchId);

    if (!branchId) {
      return { message: "No branch context available for patient report." };
    }

    const [newPatientsRes, returningPatientsRes] = await Promise.all([
      apiRequest(`/branches/${branchId}/patients?type=new&limit=200`, {}, token) as Promise<Record<string, unknown>>,
      apiRequest(`/branches/${branchId}/patients?type=old&limit=200`, {}, token) as Promise<Record<string, unknown>>,
    ]);

    const newPatients = (newPatientsRes?.items ?? []) as Record<string, unknown>[];
    const returningPatients = (returningPatientsRes?.items ?? []) as Record<string, unknown>[];

    const now = new Date();
    let cutoffDate: Date;
    switch (period) {
      case "today":
        cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "quarterly":
        cutoffDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case "yearly":
        cutoffDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    const newThisPeriod = newPatients.filter((p) => {
      const fd = String(p.first_visit_date ?? p.created_at ?? "");
      return fd >= cutoffStr;
    });

    const byMonth: Record<string, number> = {};
    for (const p of newPatients) {
      const fd = String(p.first_visit_date ?? p.created_at ?? "").substring(0, 7);
      if (fd) byMonth[fd] = (byMonth[fd] ?? 0) + 1;
    }

    return {
      period,
      totalNewPatients: newPatients.length,
      totalReturningPatients: returningPatients.length,
      totalPatients: newPatients.length + returningPatients.length,
      newThisPeriod: newThisPeriod.length,
      monthlyBreakdown: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-12),
    };
  },

  get_booking_report: async (user, params, token) => {
    const period = String(params.period ?? "monthly");
    const now = new Date();
    let dateFrom: string;
    let dateTo: string;

    switch (period) {
      case "today": {
        const d = now.toISOString().split("T")[0];
        dateFrom = d;
        dateTo = d;
        break;
      }
      case "weekly": {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
      case "quarterly": {
        const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
      case "yearly": {
        dateFrom = `${now.getFullYear()}-01-01`;
        dateTo = now.toISOString().split("T")[0];
        break;
      }
      default: {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
    }

    const q = new URLSearchParams();
    q.set("date_from", dateFrom);
    q.set("date_to", dateTo);
    q.set("limit", "200");
    const bookingClinicId = resolveClinicId(user);
    const bookingBranchId = resolveBranchId(user, params.branchId);
    if (bookingClinicId) q.set("clinic_id", bookingClinicId);
    if (bookingBranchId) q.set("branch_id", bookingBranchId);

    const appointRes = await apiRequest(`/appointments?${q}`, {}, token) as Record<string, unknown>;
    const appointments = (appointRes?.items ?? []) as Record<string, unknown>[];

    const byStatus: Record<string, number> = {};
    const byDoctor: Record<string, { total: number; completed: number; cancelled: number }> = {};
    const byDay: Record<string, number> = {};
    let totalFee = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let pendingCount = 0;
    let noShowCount = 0;

    for (const a of appointments) {
      const status = String(a.status ?? "unknown");
      const doctor = String(a.doctor_name ?? "Unknown");
      const date = String(a.scheduled_date ?? "").split("T")[0];
      const fee = Number(a.fee_amount ?? 0);

      byStatus[status] = (byStatus[status] ?? 0) + 1;

      if (status === "completed") { completedCount++; totalFee += fee; }
      if (status === "cancelled") cancelledCount++;
      if (status === "pending") pendingCount++;
      if (status === "no_show") noShowCount++;

      if (doctor !== "Unknown") {
        if (!byDoctor[doctor]) byDoctor[doctor] = { total: 0, completed: 0, cancelled: 0 };
        byDoctor[doctor].total++;
        if (status === "completed") byDoctor[doctor].completed++;
        if (status === "cancelled") byDoctor[doctor].cancelled++;
      }
      if (date) byDay[date] = (byDay[date] ?? 0) + 1;
    }

    const total = appointments.length;
    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelledCount / total) * 100) : 0;
    const confirmationRate = total > 0 ? Math.round(((total - pendingCount) / total) * 100) : 0;

    return {
      period,
      dateFrom,
      dateTo,
      total,
      totalFee,
      byStatus,
      completedCount,
      cancelledCount,
      pendingCount,
      noShowCount,
      completionRate,
      cancellationRate,
      confirmationRate,
      byDoctor: Object.entries(byDoctor).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total),
      byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30),
    };
  },

  get_lab_test_report: async (user, params, token) => {
    const period = String(params.period ?? "monthly");
    const now = new Date();
    let dateFrom: string;
    let dateTo: string;

    switch (period) {
      case "today": {
        const d = now.toISOString().split("T")[0];
        dateFrom = d;
        dateTo = d;
        break;
      }
      case "quarterly": {
        const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
      case "yearly": {
        dateFrom = `${now.getFullYear()}-01-01`;
        dateTo = now.toISOString().split("T")[0];
        break;
      }
      default: {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
    }

    const q = new URLSearchParams();
    q.set("date_from", dateFrom);
    q.set("date_to", dateTo);
    q.set("limit", "200");
    const labReportBranchId = resolveBranchId(user, params.branchId);
    if (labReportBranchId) q.set("branch_id", labReportBranchId);

    const labRes = await apiRequest(`/clinic/lab-test-appointments?${q}`, {}, token) as Record<string, unknown>;
    const appointments = (labRes?.items ?? []) as Record<string, unknown>[];

    const byStatus: Record<string, number> = {};
    const byTest: Record<string, { count: number; revenue: number }> = {};
    const byPaymentStatus: Record<string, number> = {};
    let totalRevenue = 0;

    for (const a of appointments) {
      const status = String(a.status ?? "unknown");
      const testName = String((a.test as Record<string, unknown>)?.name ?? a.test_name ?? "Unknown");
      const pStatus = String(a.payment_status ?? "unknown");
      const price = Number(a.price ?? 0);

      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byPaymentStatus[pStatus] = (byPaymentStatus[pStatus] ?? 0) + 1;

      if (pStatus === "PAID") totalRevenue += price;

      if (testName !== "Unknown") {
        if (!byTest[testName]) byTest[testName] = { count: 0, revenue: 0 };
        byTest[testName].count++;
        if (pStatus === "PAID") byTest[testName].revenue += price;
      }
    }

    return {
      period,
      dateFrom,
      dateTo,
      total: appointments.length,
      totalRevenue,
      byStatus,
      byPaymentStatus,
      mostBookedTests: Object.entries(byTest)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  },

  get_business_summary: async (user, params, token) => {
    const period = String(params.period ?? "today");
    const now = new Date();
    let dateFrom: string;
    let dateTo: string;

    switch (period) {
      case "today": {
        const d = now.toISOString().split("T")[0];
        dateFrom = d;
        dateTo = d;
        break;
      }
      case "weekly": {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
      default: {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        break;
      }
    }

    const q = new URLSearchParams();
    q.set("date_from", dateFrom);
    q.set("date_to", dateTo);
    q.set("limit", "200");
    const summaryClinicId = resolveClinicId(user);
    const summaryBranchId = resolveBranchId(user);
    if (summaryClinicId) q.set("clinic_id", summaryClinicId);
    if (summaryBranchId) q.set("branch_id", summaryBranchId);

    const [appointRes, notifRes] = await Promise.all([
      apiRequest(`/appointments?${q}`, {}, token) as Promise<Record<string, unknown>>,
      apiRequest(`/notifications?unread_only=true&limit=5`, {}, token).catch(() => ({ items: [] })) as Promise<Record<string, unknown>>,
    ]);

    const appointments = (appointRes?.items ?? []) as Record<string, unknown>[];
    const unreadNotifs = Array.isArray(notifRes?.items) ? notifRes.items.length : 0;

    let revenue = 0;
    let pending = 0;
    let completed = 0;
    let cancelled = 0;
    let todayBookings = 0;

    for (const a of appointments) {
      const status = String(a.status ?? "");
      const fee = Number(a.fee_amount ?? 0);
      if (status === "completed" || status === "paid") { revenue += fee; completed++; }
      if (status === "pending") pending++;
      if (status === "cancelled") cancelled++;
      todayBookings++;
    }

    const alerts: string[] = [];
    if (pending > 0) alerts.push(`${pending} appointment(s) pending confirmation`);
    if (unreadNotifs > 0) alerts.push(`${unreadNotifs} unread notification(s)`);

    let subscriptionInfo: Record<string, unknown> | null = null;
    if (user.clinicId) {
      try {
        const subRes = await apiRequest(`/clinics/${user.clinicId}/subscription`, {}, token) as Record<string, unknown>;
        const sub = subRes?.subscription as Record<string, unknown> | undefined;
        if (sub) {
          subscriptionInfo = {
            status: sub.status,
            daysRemaining: sub.days_remaining,
            expiringSoon: sub.expiring_soon,
          };
          if (sub.status === "EXPIRING" || sub.expiring_soon) {
            alerts.push(`Subscription expiring in ${sub.days_remaining} days`);
          }
          if (sub.status === "EXPIRED") {
            alerts.push("Subscription has expired!");
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return {
      period,
      dateFrom,
      dateTo,
      totalBookings: todayBookings,
      revenue,
      pending,
      completed,
      cancelled,
      unreadNotifications: unreadNotifs,
      subscription: subscriptionInfo,
      alerts,
      needsAttention: alerts.length > 0,
    };
  },

  get_analytics: async (user, params, token) => {
    const type = String(params.type ?? "revenue_comparison");
    const period = String(params.period ?? "monthly");
    const now = new Date();

    function getPeriodDates(p: string, offset: number): { from: string; to: string } {
      const d = new Date(now);
      switch (p) {
        case "monthly":
          d.setMonth(d.getMonth() - offset);
          return {
            from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0],
            to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0],
          };
        case "quarterly": {
          const qStart = Math.floor(d.getMonth() / 3) * 3;
          d.setMonth(qStart - offset * 3);
          return {
            from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0],
            to: new Date(d.getFullYear(), d.getMonth() + 3, 0).toISOString().split("T")[0],
          };
        }
        case "yearly":
          d.setFullYear(d.getFullYear() - offset);
          return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
        default:
          return { from: "", to: "" };
      }
    }

    const current = getPeriodDates(period, 0);
    const previous = getPeriodDates(period, 1);

    const analyticsClinicId = resolveClinicId(user);
    const analyticsBranchId = resolveBranchId(user);

    async function fetchAppointments(from: string, to: string) {
      const q = new URLSearchParams();
      q.set("date_from", from);
      q.set("date_to", to);
      q.set("limit", "200");
      if (analyticsClinicId) q.set("clinic_id", analyticsClinicId);
      if (analyticsBranchId) q.set("branch_id", analyticsBranchId);
      const res = await apiRequest(`/appointments?${q}`, {}, token) as Record<string, unknown>;
      return (res?.items ?? []) as Record<string, unknown>[];
    }

    const [currentAppts, previousAppts] = await Promise.all([
      fetchAppointments(current.from, current.to),
      fetchAppointments(previous.from, previous.to),
    ]);

    function summarize(appts: Record<string, unknown>[]) {
      let revenue = 0;
      let completed = 0;
      let cancelled = 0;
      const doctors: Record<string, number> = {};
      for (const a of appts) {
        const status = String(a.status ?? "");
        const fee = Number(a.fee_amount ?? 0);
        if (status === "completed" || status === "paid") { revenue += fee; completed++; }
        if (status === "cancelled") cancelled++;
        const doc = String(a.doctor_name ?? "");
        if (doc) doctors[doc] = (doctors[doc] ?? 0) + 1;
      }
      return { total: appts.length, revenue, completed, cancelled, doctors };
    }

    const currSummary = summarize(currentAppts);
    const prevSummary = summarize(previousAppts);

    function pctChange(curr: number, prev: number): string {
      if (prev === 0) return curr > 0 ? "+100%" : "0%";
      const pct = Math.round(((curr - prev) / prev) * 100);
      return `${pct > 0 ? "+" : ""}${pct}%`;
    }

    return {
      type,
      period,
      currentPeriod: { ...current, ...currSummary },
      previousPeriod: { ...previous, ...prevSummary },
      comparison: {
        revenueChange: pctChange(currSummary.revenue, prevSummary.revenue),
        bookingChange: pctChange(currSummary.total, prevSummary.total),
        completionChange: pctChange(currSummary.completed, prevSummary.completed),
        cancellationChange: pctChange(currSummary.cancelled, prevSummary.cancelled),
      },
      topDoctors: Object.entries(currSummary.doctors)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  },

  confirm_appointment: async (_user, params, token) => {
    return apiRequest(`/appointments/${params.appointmentId}/confirm`, { method: "PATCH" }, token);
  },

  complete_appointment: async (_user, params, token) => {
    return apiRequest(`/appointments/${params.appointmentId}/complete`, { method: "PATCH" }, token);
  },

  cancel_appointment: async (_user, params, token) => {
    return apiRequest(`/appointments/${params.appointmentId}/cancel`, { method: "PATCH" }, token);
  },

  approve_lab_appointment: async (_user, params, token) => {
    return apiRequest(`/clinic/lab-test-appointments/${params.appointmentId}/approve`, { method: "PATCH" }, token);
  },

  reject_lab_appointment: async (_user, params, token) => {
    return apiRequest(`/clinic/lab-test-appointments/${params.appointmentId}/reject`, { method: "PATCH" }, token);
  },

  mark_notification_read: async (_user, params, token) => {
    return apiRequest(`/notifications/${params.notificationId}/read`, { method: "PATCH" }, token);
  },

  mark_all_notifications_read: async (_user, _params, token) => {
    return apiRequest(`/notifications/read-all`, { method: "PATCH" }, token);
  },

  complete_lab_appointment: async (_user, params, token) => {
    return apiRequest(`/clinic/lab-test-appointments/${params.appointmentId}/complete`, { method: "POST" }, token);
  },
};

export async function executeTool(
  user: AiUser,
  toolCall: ToolCall,
  token?: string
): Promise<ToolResult> {
  const startTime = Date.now();
  const tool = getToolById(toolCall.toolId);

  if (!tool) {
    return {
      toolCallId: toolCall.id,
      success: false,
      error: `Unknown tool: ${toolCall.toolId}`,
      executionTimeMs: Date.now() - startTime,
    };
  }

  const permCheck = checkToolPermissions(user, toolCall.toolId);
  if (!permCheck.allowed) {
    return {
      toolCallId: toolCall.id,
      success: false,
      error: permCheck.reason,
      executionTimeMs: Date.now() - startTime,
    };
  }

  const handler = toolHandlers[toolCall.toolId];
  if (!handler) {
    return {
      toolCallId: toolCall.id,
      success: false,
      error: `Tool handler not implemented: ${toolCall.toolId}`,
      executionTimeMs: Date.now() - startTime,
    };
  }

  try {
    const result = await Promise.race([
      handler(user, toolCall.parameters, token),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tool execution timed out")), tool.timeout)
      ),
    ]);

    return {
      toolCallId: toolCall.id,
      success: true,
      data: result,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown execution error";
    return {
      toolCallId: toolCall.id,
      success: false,
      error: message,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

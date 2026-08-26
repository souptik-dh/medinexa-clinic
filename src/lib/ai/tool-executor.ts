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
    if (user.clinicId) q.set("clinic_id", user.clinicId);
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
    const clinicId = params.clinicId ?? user.clinicId;
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

  get_dashboard_stats: async (_user, _params, token) => {
    return apiRequest("/super-admin/statistics", {}, token);
  },

  get_reviews: async (user, params, token) => {
    if (params.doctorId) {
      return apiRequest(`/doctors/${params.doctorId}/reviews`, {}, token);
    }
    const branchId = params.branchId ?? user.branchId;
    if (branchId) {
      return apiRequest(`/branches/${branchId}/reviews`, {}, token);
    }
    return { items: [], message: "Please specify a doctor or branch to look up reviews." };
  },

  get_staff_list: async (user, params, token) => {
    const branchId = params.branchId ?? user.branchId;

    if (branchId) {
      const result = await apiRequest(`/branches/${branchId}/staff`, {}, token) as Record<string, unknown>;
      const items = result?.items ?? result?.staff ?? [];
      if (Array.isArray(items) && items.length > 0) return result;

      if (user.clinicId) {
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

    if (user.clinicId) {
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
    const branchId = params.branchId ?? user.branchId;
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

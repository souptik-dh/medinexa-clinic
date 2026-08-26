import type { BranchStaffPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/api";

export interface AiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId?: string | null;
  clinicId?: string | null;
  permissions?: BranchStaffPermission[];
}

export type IntentType =
  | "search_appointments"
  | "search_patients"
  | "search_doctors"
  | "search_clinics"
  | "search_branches"
  | "search_lab_tests"
  | "get_appointment_details"
  | "get_patient_details"
  | "get_doctor_details"
  | "get_clinic_details"
  | "get_branch_details"
  | "get_notifications"
  | "get_subscription"
  | "get_prescriptions"
  | "get_lab_test_appointments"
  | "get_dashboard_stats"
  | "get_reviews"
  | "get_staff_list"
  | "get_branch_schedule"
  | "get_ledger"
  | "get_audit_logs"
  | "get_platform_stats"
  | "get_sales_report"
  | "get_patient_report"
  | "get_booking_report"
  | "get_lab_test_report"
  | "get_business_summary"
  | "get_analytics"
  | "confirm_appointment"
  | "complete_appointment"
  | "cancel_appointment"
  | "approve_lab_appointment"
  | "reject_lab_appointment"
  | "complete_lab_appointment"
  | "mark_notification_read"
  | "mark_all_notifications_read"
  | "navigate"
  | "help"
  | "greeting"
  | "unknown";

export interface Intent {
  type: IntentType;
  confidence: number;
  entities: Record<string, string>;
  originalQuery: string;
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  required: boolean;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: "read" | "write" | "navigate" | "info";
  requiredRole?: UserRole[];
  requiredPermissions?: BranchStaffPermission[];
  requiresConfirmation: boolean;
  parameters: ToolParameter[];
  timeout: number;
}

export interface ToolCall {
  id: string;
  toolId: string;
  parameters: Record<string, unknown>;
  timestamp: number;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
}

export interface AgentStep {
  type: "planning" | "checking_permissions" | "executing" | "verifying" | "completed" | "error";
  description: string;
  icon?: string;
  toolCallId?: string;
  timestamp: number;
}

export interface NavigationLink {
  label: string;
  href: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  steps?: AgentStep[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  confirmationRequired?: ConfirmationRequest;
  navigationLinks?: NavigationLink[];
}

export interface ConfirmationRequest {
  toolId: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  pendingRunId: string;
}

export interface Conversation {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  confirmationResponse?: {
    pendingRunId: string;
    approved: boolean;
  };
}

export interface ChatResponse {
  conversationId: string;
  message: ChatMessage;
  steps: AgentStep[];
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxToolCallsPerMinute: number;
  maxToolCallsPerRequest: number;
  requestTimeoutMs: number;
}

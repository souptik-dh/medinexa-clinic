import type {
  AiUser,
  Intent,
  ChatMessage,
  AgentStep,
  ToolCall,
  ToolResult,
  NavigationLink,
} from "./types";
import { recognizeIntent } from "./intent-engine";
import { getToolById } from "./tools";
import { checkToolPermissions, executeTool } from "./tool-executor";
import { logToolExecution, logBlockedAction } from "./audit-logger";
import {
  checkRateLimit,
  checkToolCallRateLimit,
} from "./rate-limiter";

function generateId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 9);
  return "msg_" + ts + "_" + rand;
}

function mapIntentToTool(intent: Intent): string | null {
  const mapping: Record<string, string> = {
    search_appointments: "search_appointments",
    search_patients: "search_patients",
    search_doctors: "search_doctors",
    search_clinics: "search_clinics",
    search_branches: "search_branches",
    search_lab_tests: "search_lab_tests",
    get_appointment_details: "get_appointment_details",
    get_patient_details: "search_patients",
    get_doctor_details: "search_doctors",
    get_clinic_details: "search_clinics",
    get_branch_details: "search_branches",
    get_notifications: "get_notifications",
    get_subscription: "get_subscription",
    get_prescriptions: "get_prescriptions",
    get_lab_test_appointments: "get_lab_test_appointments",
    get_dashboard_stats: "get_dashboard_stats",
    get_reviews: "get_reviews",
    get_staff_list: "get_staff_list",
    get_branch_schedule: "get_branch_schedule",
    get_ledger: "get_ledger",
    get_audit_logs: "get_audit_logs",
    get_platform_stats: "get_platform_stats",
    get_sales_report: "get_sales_report",
    get_patient_report: "get_patient_report",
    get_booking_report: "get_booking_report",
    get_lab_test_report: "get_lab_test_report",
    get_business_summary: "get_business_summary",
    get_analytics: "get_analytics",
    confirm_appointment: "confirm_appointment",
    complete_appointment: "complete_appointment",
    cancel_appointment: "cancel_appointment",
    approve_lab_appointment: "approve_lab_appointment",
    reject_lab_appointment: "reject_lab_appointment",
    complete_lab_appointment: "complete_lab_appointment",
    mark_notification_read: "mark_notification_read",
    mark_all_notifications_read: "mark_all_notifications_read",
  };
  return mapping[intent.type] ?? null;
}

function generateParameters(
  intent: Intent
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (intent.entities.status) params.status = intent.entities.status;
  if (intent.entities.date) params.date = intent.entities.date;
  if (intent.entities.query) params.query = intent.entities.query;
  if (intent.entities.unreadOnly) params.unreadOnly = true;
  if (intent.entities.appointmentId)
    params.appointmentId = intent.entities.appointmentId;
  if (intent.entities.notificationId)
    params.notificationId = intent.entities.notificationId;
  if (intent.entities.doctorId) params.doctorId = intent.entities.doctorId;
  if (intent.entities.branchId) params.branchId = intent.entities.branchId;

  if (intent.entities.period) {
    const p = intent.entities.period.toLowerCase();
    if (p === "today") params.period = "today";
    else if (p === "this week" || p === "weekly") params.period = "weekly";
    else if (p === "this quarter" || p === "last quarter" || p === "quarterly") params.period = "quarterly";
    else if (p === "this year" || p === "last year" || p === "yearly") params.period = "yearly";
    else params.period = "monthly";
  }

  if (intent.entities.analyticsType) {
    const t = intent.entities.analyticsType.toLowerCase();
    if (t.includes("revenue")) params.type = "revenue_comparison";
    else if (t.includes("patient")) params.type = "patient_growth";
    else if (t.includes("booking") || t.includes("appointment")) params.type = "booking_trends";
    else params.type = "performance";
  }

  if (intent.entities.destination) {
    params.destination = intent.entities.destination;
  }

  return params;
}

interface PendingConfirmation {
  runId: string;
  toolCall: ToolCall;
  toolName: string;
  description: string;
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

export async function processMessage(
  user: AiUser,
  message: string,
  conversationId?: string,
  confirmationResponse?: { pendingRunId: string; approved: boolean },
  token?: string
): Promise<{
  response: ChatMessage;
  steps: AgentStep[];
  newConversationId: string;
}> {
  const steps: AgentStep[] = [];

  const rateCheck = checkRateLimit(user.id);
  if (!rateCheck.allowed) {
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: `Rate limit exceeded. Please try again in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)} seconds.`,
        timestamp: Date.now(),
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  if (confirmationResponse) {
    const pending = pendingConfirmations.get(confirmationResponse.pendingRunId);
    if (pending) {
      pendingConfirmations.delete(confirmationResponse.pendingRunId);

      if (!confirmationResponse.approved) {
        return {
          response: {
            id: generateId(),
            role: "assistant",
            content: "Action cancelled. Let me know if there's anything else I can help with.",
            timestamp: Date.now(),
          },
          steps: [...steps, { type: "completed", description: "Action cancelled by user", icon: "🚫", timestamp: Date.now() }],
          newConversationId: conversationId ?? generateId(),
        };
      }

      steps.push({
        type: "executing",
        description: `Executing ${pending.toolName}...`,
        toolCallId: pending.toolCall.id,
        timestamp: Date.now(),
      });

      const toolResult = await executeTool(user, pending.toolCall, token);

      logToolExecution(user, pending.toolCall, pending.toolName, toolResult);

      steps.push({
        type: "verifying",
        description: toolResult.success
          ? `${pending.toolName} completed successfully`
          : `${pending.toolName} failed: ${toolResult.error}`,
        toolCallId: pending.toolCall.id,
        timestamp: Date.now(),
      });

      const responseContent = formatToolResult(
        pending.toolCall.toolId,
        pending.toolName,
        toolResult
      );

      steps.push({ type: "completed", description: "Done", icon: "✅", timestamp: Date.now() });

      return {
        response: {
          id: generateId(),
          role: "assistant",
          content: responseContent,
          timestamp: Date.now(),
          steps,
          toolCalls: [pending.toolCall],
          toolResults: [toolResult],
        },
        steps,
        newConversationId: conversationId ?? generateId(),
      };
    }
  }

  const intent = recognizeIntent(message);

  steps.push({
    type: "planning",
    description: `Understanding request`,
    icon: "🔎",
    timestamp: Date.now(),
  });

  steps.push({
    type: "planning",
    description: `Intent: ${intent.type.replace(/_/g, " ")} (${Math.round(intent.confidence * 100)}% confidence)`,
    icon: "🧠",
    timestamp: Date.now(),
  });

  if (intent.type === "greeting") {
    steps.push({ type: "completed", description: "Greeting response", icon: "👋", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: getGreetingResponse(user),
        timestamp: Date.now(),
        steps,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  if (intent.type === "help") {
    steps.push({ type: "completed", description: "Help response", icon: "📖", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: getHelpResponse(user),
        timestamp: Date.now(),
        steps,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  if (intent.type === "navigate") {
    const dest = intent.entities.destination ?? "the page you requested";
    const navLinks = getNavigationLinks(dest);
    const linkText = navLinks.length > 0
      ? `\n\n${navLinks.map((l) => `- [${l.label}](${l.href})`).join("\n")}`
      : "";
    steps.push({ type: "completed", description: "Navigation guidance", icon: "🧭", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: `You can navigate to **${dest}** using the sidebar menu.${linkText}\n\nLet me know if you need help finding anything specific!`,
        timestamp: Date.now(),
        steps,
        navigationLinks: navLinks,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  if (intent.type === "unknown") {
    steps.push({ type: "completed", description: "Could not determine intent", icon: "❓", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: getUnknownResponse(message),
        timestamp: Date.now(),
        steps,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  const toolId = mapIntentToTool(intent);
  if (!toolId) {
    steps.push({ type: "completed", description: "No tool for this intent", icon: "🔧", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: "I understand what you're asking, but I don't have a tool to handle that yet. Is there anything else I can help with?",
        timestamp: Date.now(),
        steps,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  const tool = getToolById(toolId);
  if (!tool) {
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: "I encountered an internal error. Please try again.",
        timestamp: Date.now(),
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  steps.push({
    type: "checking_permissions",
    description: `Verifying your access`,
    icon: "🔐",
    timestamp: Date.now(),
  });

  const permCheck = checkToolPermissions(user, toolId);
  if (!permCheck.allowed) {
    logBlockedAction(user, toolId, tool.name, permCheck.reason ?? "Permission denied");
    steps.push({ type: "error", description: `Access denied: ${permCheck.reason}`, icon: "🚫", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: `I can't perform that action. ${permCheck.reason}. Please check with your administrator if you believe you should have access.`,
        timestamp: Date.now(),
        steps,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  steps.push({
    type: "checking_permissions",
    description: "Access verified",
    icon: "✅",
    timestamp: Date.now(),
  });

  const parameters = generateParameters(intent);
  const toolCall: ToolCall = {
    id: generateId(),
    toolId,
    parameters,
    timestamp: Date.now(),
  };

  if (tool.requiresConfirmation) {
    const runId = generateId();
    const pending: PendingConfirmation = {
      runId,
      toolCall,
      toolName: tool.name,
      description: buildConfirmationDescription(toolId, parameters),
    };
    pendingConfirmations.set(runId, pending);

    steps.push({
      type: "executing",
      description: "Confirmation required",
      icon: "⚠️",
      toolCallId: toolCall.id,
      timestamp: Date.now(),
    });

    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: buildConfirmationMessage(tool.name, parameters),
        timestamp: Date.now(),
        steps,
        toolCalls: [toolCall],
        confirmationRequired: {
          toolId,
          toolName: tool.name,
          description: pending.description,
          parameters,
          pendingRunId: runId,
        },
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  const toolRateCheck = checkToolCallRateLimit(user.id);
  if (!toolRateCheck.allowed) {
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: `Tool call rate limit exceeded. Please wait ${Math.ceil((toolRateCheck.retryAfterMs ?? 0) / 1000)} seconds.`,
        timestamp: Date.now(),
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  steps.push({
    type: "executing",
    description: `Running ${tool.name}...`,
    icon: "⚙️",
    toolCallId: toolCall.id,
    timestamp: Date.now(),
  });

  const toolResult = await executeTool(user, toolCall, token);

  logToolExecution(user, toolCall, tool.name, toolResult);

  steps.push({
    type: "verifying",
    description: toolResult.success
      ? `Completed in ${toolResult.executionTimeMs}ms`
      : `Failed: ${toolResult.error}`,
    icon: toolResult.success ? "✅" : "❌",
    toolCallId: toolCall.id,
    timestamp: Date.now(),
  });

  const responseContent = formatToolResult(toolId, tool.name, toolResult);

  return {
    response: {
      id: generateId(),
      role: "assistant",
      content: responseContent,
      timestamp: Date.now(),
      steps,
      toolCalls: [toolCall],
      toolResults: [toolResult],
    },
    steps,
    newConversationId: conversationId ?? generateId(),
  };
}

function formatToolResult(
  toolId: string,
  toolName: string,
  result: ToolResult
): string {
  if (!result.success) {
    return `I ran **${toolName}** but encountered an error: ${result.error}. Please try again or check if the data exists.`;
  }

  const data = result.data as Record<string, unknown> | unknown[] | null;

  if (!data) {
    return `**${toolName}** completed but returned no data.`;
  }

  const REPORT_TOOLS = [
    "get_sales_report", "get_patient_report", "get_booking_report",
    "get_lab_test_report", "get_business_summary", "get_analytics",
  ];
  if (REPORT_TOOLS.includes(toolId) && typeof data === "object" && !Array.isArray(data)) {
    return `### ${toolName}\n\n` + formatReportResult(toolId, data as Record<string, unknown>);
  }

  if (toolId === "get_subscription" && typeof data === "object" && !Array.isArray(data)) {
    return formatSubscriptionResult(data as Record<string, unknown>);
  }

  // Unwrap common API response envelopes
  if (typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const inner = obj.items ?? obj.results ?? obj.data ?? obj.doctors;
    if (Array.isArray(inner)) {
      if (inner.length === 0) {
        return `No results found for **${toolName.toLowerCase()}**. There may be no matching records.`;
      }
      return formatArrayResult(toolName, inner);
    }
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return `No results found for **${toolName.toLowerCase()}**. There may be no matching records.`;
    }
    return formatArrayResult(toolName, data);
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (obj.message && typeof obj.message === "string") {
      return `**${toolName}**: ${obj.message}`;
    }
    return formatObjectResult(toolName, obj);
  }

  return `**${toolName}** completed successfully.`;
}

function formatArrayResult(toolName: string, items: unknown[]): string {
  const lines: string[] = [`### ${toolName}\n`];
  lines.push(`Found **${items.length}** result${items.length === 1 ? "" : "s"}.\n`);

  const displayItems = items.slice(0, 10);

  for (const item of displayItems) {
    if (typeof item !== "object" || item === null) {
      lines.push(`- ${String(item)}`);
      continue;
    }
    const obj = item as Record<string, unknown>;
    const name = String(obj.name ?? obj.patient_name ?? obj.doctor_name ?? obj.test_name ?? "");
    const status = String(obj.status ?? "");
    const date = String(obj.scheduled_date ?? obj.created_at ?? "");
    const email = String(obj.email ?? "");
    const phone = String(obj.phone ?? "");
    const branchName = String(obj._branch_name ?? "");

    const parts: string[] = [];
    if (name) parts.push(`**${name}**`);
    if (email) parts.push(email);
    if (phone) parts.push(phone);
    if (status) parts.push(`Status: ${status}`);
    if (date) parts.push(`Date: ${date}`);
    if (branchName) parts.push(`Branch: ${branchName}`);

    lines.push(`- ${parts.join(" | ") || "(no details available)"}`);
  }

  if (items.length > 10) {
    lines.push(`\n_...and ${items.length - 10} more_`);
  }

  return lines.join("\n");
}

function formatSubscriptionResult(data: Record<string, unknown>): string {
  const sub = (data.subscription ?? {}) as Record<string, unknown>;
  const plan = (data.current_plan ?? {}) as Record<string, unknown>;

  const status = String(sub.status ?? "Unknown");
  const currency = String(plan.currency ?? sub.currency ?? "");
  const amount = plan.monthly_amount ?? sub.monthly_amount;

  const lines: string[] = ["### Subscription\n"];

  if (sub.is_trial) {
    lines.push(`You're currently on a **free trial** (status: **${status}**).`);
  } else {
    lines.push(`Your subscription is currently **${status}**.`);
  }
  if (sub.blocked) {
    lines.push(`⚠️ Access is **blocked**${sub.blocked_reason ? `: ${String(sub.blocked_reason)}` : "."}`);
  } else if (sub.expiring_soon) {
    lines.push(`⚠️ It is expiring soon — **${String(sub.days_remaining)} day${sub.days_remaining === 1 ? "" : "s"}** remaining.`);
  }
  lines.push("");

  lines.push(`| Detail | Value |`);
  lines.push(`|--------|-------|`);
  if (plan.name) lines.push(`| Plan | ${String(plan.name)} |`);
  if (amount !== undefined) lines.push(`| Monthly Amount | ${currency} ${Number(amount).toLocaleString("en-IN")} |`);
  if (sub.days_remaining !== undefined) lines.push(`| Days Remaining | ${String(sub.days_remaining)} |`);
  if (sub.period_start) lines.push(`| Period Start | ${String(sub.period_start)} |`);
  if (sub.period_end) lines.push(`| Period End | ${String(sub.period_end)} |`);
  if (sub.auto_renew !== undefined) lines.push(`| Auto Renew | ${sub.auto_renew ? "Yes" : "No"} |`);

  return lines.join("\n");
}

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) {
    return val.map((v) => formatFieldValue(v)).filter(Boolean).join(", ");
  }
  if (typeof val === "object") {
    const nested = val as Record<string, unknown>;
    return Object.keys(nested)
      .slice(0, 8)
      .map((k) => `${k.replace(/_/g, " ")}: ${formatFieldValue(nested[k]).substring(0, 60)}`)
      .join(", ");
  }
  return String(val);
}

function formatObjectResult(toolName: string, obj: Record<string, unknown>): string {
  const lines: string[] = [`### ${toolName}\n`];

  const displayKeys = [
    "name", "email", "phone", "status", "created_at",
    "description", "fee_amount", "currency",
    "average", "count", "total", "monthly_amount",
    "period_start", "period_end", "message",
  ];

  let found = false;
  for (const key of displayKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      lines.push(`**${key.replace(/_/g, " ")}**: ${formatFieldValue(obj[key])}`);
      found = true;
    }
  }

  if (!found) {
    const keys = Object.keys(obj)
      .filter((k) => !/(^|_)id$/i.test(k))
      .slice(0, 8);
    for (const key of keys) {
      const val = formatFieldValue(obj[key]).substring(0, 100);
      lines.push(`**${key.replace(/_/g, " ")}**: ${val}`);
    }
  }

  return lines.join("\n");
}

function buildConfirmationDescription(
  toolId: string,
  params: Record<string, unknown>
): string {
  const id = params.appointmentId ?? params.notificationId ?? "N/A";
  switch (toolId) {
    case "confirm_appointment":
      return `Confirm appointment ${id}`;
    case "complete_appointment":
      return `Mark appointment ${id} as completed`;
    case "cancel_appointment":
      return `Cancel appointment ${id}`;
    case "approve_lab_appointment":
      return `Approve lab test appointment ${id}`;
    case "reject_lab_appointment":
      return `Reject lab test appointment ${id}`;
    case "complete_lab_appointment":
      return `Mark lab test appointment ${id} as completed`;
    case "mark_all_notifications_read":
      return "Mark all notifications as read";
    default:
      return `Execute ${toolId}`;
  }
}

function buildConfirmationMessage(
  toolName: string,
  params: Record<string, unknown>
): string {
  const id = params.appointmentId ?? params.notificationId ?? "N/A";
  const target = params.appointmentId ? `**Target:** ${id}` : "";
  return (
    `I need your confirmation before proceeding.\n\n` +
    `**Action:** ${toolName}\n` +
    `${target}\n\n` +
    `Do you want me to proceed? (Reply "yes" to confirm or "no" to cancel)`
  );
}

function getGreetingResponse(user: AiUser): string {
  const hour = new Date().getHours();
  let timeGreeting: string;
  if (hour < 12) timeGreeting = "Good morning";
  else if (hour < 17) timeGreeting = "Good afternoon";
  else timeGreeting = "Good evening";

  return (
    `${timeGreeting}, **${user.name}**! I'm your MediNexa AI assistant. ` +
    `I can help you with:\n\n` +
    "- **Viewing** appointments, patients, doctors, lab tests, and notifications\n" +
    "- **Reports** on sales, patients, bookings, and lab tests\n" +
    "- **Analytics** with comparisons, trends, and insights\n" +
    "- **Business summaries** with alerts and key metrics\n" +
    "- **Managing** appointments and lab test workflows\n" +
    "- **Navigating** the dashboard\n\n" +
    `What would you like to do?`
  );
}

function getHelpResponse(user: AiUser): string {
  const sections: string[] = [
    "## What I Can Do\n",
    "### Query Data",
    "- \"Show me today's appointments\"",
    "- \"List all patients\"",
    "- \"Find Dr. Smith\"",
    "- \"What's my subscription status?\"",
    "- \"Show unread notifications\"",
    "- \"Show lab test appointments\"\n",
    "### Sales & Revenue Reports",
    "- \"Show today's sales\"",
    "- \"Show monthly revenue\"",
    "- \"Show quarterly sales report\"",
    "- \"Show yearly revenue\"\n",
    "### Patient Reports",
    "- \"Show new patients this month\"",
    "- \"Show patient growth\"",
    "- \"How many patients do I have?\"\n",
    "### Booking & Appointment Reports",
    "- \"Show today's bookings\"",
    "- \"Show booking statistics\"",
    "- \"What is the appointment completion rate?\"\n",
    "### Lab Test Reports",
    "- \"Show lab test revenue\"",
    "- \"Show monthly lab test bookings\"",
    "- \"Most booked lab tests\"\n",
    "### Business Insights",
    "- \"Give me today's summary\"",
    "- \"Show business performance\"",
    "- \"What needs my attention?\"\n",
    "### Analytics",
    "- \"Compare this month with last month\"",
    "- \"Show revenue growth\"",
    "- \"Show patient trends\"\n",
    "### Take Actions",
    "- \"Confirm appointment [ID]\"",
    "- \"Complete appointment [ID]\"",
    "- \"Cancel appointment [ID]\"",
    "- \"Approve lab test appointment [ID]\"",
    "- \"Mark all notifications as read\"\n",
    "### Navigate",
    "- \"Go to dashboard\"",
    "- \"Open appointments page\"\n",
    "### Tips",
    "- I enforce your **role permissions** at every step",
    "- **Destructive actions** require your explicit confirmation",
    "- I show my **thinking process** as I work through your request",
    "- The assistant is restricted to authorized data and actions within this application",
  ];

  if (user.role === "sys_admin") {
    sections.push(
      "\n### Super Admin Tools",
      "- \"Show platform statistics\"",
      "- \"Show audit logs\"",
      "- \"List all clinics\""
    );
  }

  return sections.join("\n");
}

function getUnknownResponse(query: string): string {
  const suggestions = [
    "\"Show me today's appointments\"",
    "\"List all patients\"",
    "\"Find a doctor\"",
    "\"Check my notifications\"",
    "\"What's my subscription status?\"",
    "\"Show today's sales\"",
    "\"Give me a monthly summary\"",
    "\"Help\" - to see all available commands",
  ];
  const pick = suggestions.slice(0, 4);

  return (
    `I'm not sure how to help with \"${query.substring(0, 60)}\". ` +
    `Here are some things you can try:\n\n` +
    pick.map((s) => `- ${s}`).join("\n") +
    `\n\nType **"help"** to see everything I can do.`
  );
}

const PAGE_LINKS: Record<string, NavigationLink[]> = {
  dashboard: [{ label: "Dashboard", href: "/dashboard" }],
  appointments: [{ label: "Appointments", href: "/appointments" }],
  patients: [{ label: "Patients", href: "/patients" }],
  doctors: [{ label: "Doctors", href: "/doctors" }],
  clinics: [{ label: "Clinics", href: "/clinics" }],
  branches: [{ label: "Branches", href: "/branches" }],
  staff: [{ label: "Staff", href: "/staff" }],
  billing: [{ label: "Billing", href: "/billing" }],
  settings: [{ label: "Settings", href: "/settings" }],
  notifications: [{ label: "Notifications", href: "/notifications" }],
  prescriptions: [{ label: "Prescriptions", href: "/prescriptions" }],
  reports: [{ label: "Reports", href: "/reports" }],
  "lab tests": [{ label: "Lab Tests", href: "/lab-test-appointments" }],
  "lab-test-appointments": [{ label: "Lab Test Appointments", href: "/lab-test-appointments" }],
  ledger: [{ label: "Payment Ledger", href: "/ledger" }],
  subscription: [{ label: "Subscription", href: "/billing" }],
  "ai assistant": [{ label: "AI Assistant", href: "/ai-assistant" }],
  analytics: [{ label: "Reports", href: "/reports" }],
  profile: [{ label: "Profile", href: "/settings" }],
};

function getNavigationLinks(destination: string): NavigationLink[] {
  const lower = destination.toLowerCase().trim();
  for (const [key, links] of Object.entries(PAGE_LINKS)) {
    if (lower.includes(key)) return links;
  }
  return [];
}

function formatReportResult(toolName: string, data: Record<string, unknown>): string {
  const lines: string[] = [];

  if (data.period) lines.push(`**Period:** ${String(data.period)}`);
  if (data.dateFrom && data.dateTo) lines.push(`**Date Range:** ${data.dateFrom} to ${data.dateTo}`);
  lines.push("");

  if (data.totalRevenue !== undefined) {
    const rev = Number(data.totalRevenue);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Revenue | ₹${rev.toLocaleString("en-IN")} |`);
    if (data.totalAppointments !== undefined) lines.push(`| Total Appointments | ${data.totalAppointments} |`);
    if (data.totalLabAppointments !== undefined) lines.push(`| Total Lab Appointments | ${data.totalLabAppointments} |`);
    if (data.total !== undefined && toolName.toLowerCase().includes("lab")) lines.push(`| Total Lab Tests | ${data.total} |`);
    lines.push("");
  }

  if (data.totalBookings !== undefined) {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Bookings | ${data.totalBookings} |`);
    if (data.revenue !== undefined) lines.push(`| Revenue | ₹${Number(data.revenue).toLocaleString("en-IN")} |`);
    if (data.pending !== undefined) lines.push(`| Pending | ${data.pending} |`);
    if (data.completed !== undefined) lines.push(`| Completed | ${data.completed} |`);
    if (data.cancelled !== undefined) lines.push(`| Cancelled | ${data.cancelled} |`);
    if (data.unreadNotifications !== undefined) lines.push(`| Unread Notifications | ${data.unreadNotifications} |`);
    lines.push("");
  }

  if (data.totalNewPatients !== undefined) {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total New Patients | ${data.totalNewPatients} |`);
    lines.push(`| Total Returning Patients | ${data.totalReturningPatients} |`);
    lines.push(`| Total Patients | ${data.totalPatients} |`);
    if (data.newThisPeriod !== undefined) lines.push(`| New This Period | ${data.newThisPeriod} |`);
    lines.push("");
  }

  if (data.completionRate !== undefined) {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total | ${data.total} |`);
    lines.push(`| Completed | ${data.completedCount} (${data.completionRate}%) |`);
    lines.push(`| Cancelled | ${data.cancelledCount} (${data.cancellationRate}%) |`);
    lines.push(`| Pending | ${data.pendingCount} |`);
    lines.push(`| No-Show | ${data.noShowCount} |`);
    lines.push(`| Confirmation Rate | ${data.confirmationRate}% |`);
    lines.push("");
  }

  if (data.byStatus && typeof data.byStatus === "object") {
    const entries = Object.entries(data.byStatus as Record<string, number>);
    if (entries.length > 0) {
      lines.push(`**By Status:**`);
      for (const [status, count] of entries) {
        lines.push(`- ${status}: ${count}`);
      }
      lines.push("");
    }
  }

  if (data.byDoctor && Array.isArray(data.byDoctor) && data.byDoctor.length > 0) {
    lines.push(`**By Doctor:**`);
    for (const doc of data.byDoctor.slice(0, 5) as Record<string, unknown>[]) {
      const name = String(doc.name ?? "");
      const total = doc.total ?? doc.count ?? 0;
      const completed = doc.completed;
      const line = `- **${name}**: ${total} booking${Number(total) === 1 ? "" : "s"}`;
      lines.push(completed !== undefined ? `${line} (${completed} completed)` : line);
    }
    lines.push("");
  }

  if (data.byBranch && Array.isArray(data.byBranch) && data.byBranch.length > 0) {
    lines.push(`**By Branch:**`);
    for (const b of data.byBranch.slice(0, 5) as Record<string, unknown>[]) {
      lines.push(`- **${String(b.name ?? "")}**: ${b.count} bookings, ₹${Number(b.revenue ?? 0).toLocaleString("en-IN")} revenue`);
    }
    lines.push("");
  }

  if (data.mostBookedTests && Array.isArray(data.mostBookedTests) && data.mostBookedTests.length > 0) {
    lines.push(`**Most Booked Tests:**`);
    for (const t of data.mostBookedTests.slice(0, 5) as Record<string, unknown>[]) {
      lines.push(`- **${String(t.name ?? "")}**: ${t.count} bookings, ₹${Number(t.revenue ?? 0).toLocaleString("en-IN")}`);
    }
    lines.push("");
  }

  if (data.alerts && Array.isArray(data.alerts) && data.alerts.length > 0) {
    lines.push(`**Alerts:**`);
    for (const alert of data.alerts as string[]) {
      lines.push(`- ⚠️ ${alert}`);
    }
    lines.push("");
  }

  if (data.needsAttention === false) {
    lines.push("✅ Everything looks good! No immediate attention needed.");
  }

  if (data.comparison && typeof data.comparison === "object") {
    const comp = data.comparison as Record<string, string>;
    lines.push(`**Comparison with Previous Period:**`);
    if (comp.revenueChange) lines.push(`- Revenue: ${comp.revenueChange}`);
    if (comp.bookingChange) lines.push(`- Bookings: ${comp.bookingChange}`);
    if (comp.completionChange) lines.push(`- Completions: ${comp.completionChange}`);
    if (comp.cancellationChange) lines.push(`- Cancellations: ${comp.cancellationChange}`);
    lines.push("");
  }

  if (data.topDoctors && Array.isArray(data.topDoctors) && data.topDoctors.length > 0) {
    lines.push(`**Top Performing Doctors:**`);
    for (const doc of data.topDoctors.slice(0, 3) as Record<string, unknown>[]) {
      lines.push(`- **${String(doc.name ?? "")}**: ${doc.count} appointments`);
    }
    lines.push("");
  }

  return lines.join("\n") || `**${toolName}** completed successfully.`;
}

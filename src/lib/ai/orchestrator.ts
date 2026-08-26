import type {
  AiUser,
  Intent,
  ChatMessage,
  AgentStep,
  ToolCall,
  ToolResult,
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
    confirm_appointment: "confirm_appointment",
    complete_appointment: "complete_appointment",
    cancel_appointment: "cancel_appointment",
    approve_lab_appointment: "approve_lab_appointment",
    reject_lab_appointment: "reject_lab_appointment",
    mark_notification_read: "mark_notification_read",
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
          steps: [...steps, { type: "completed", description: "Action cancelled by user", timestamp: Date.now() }],
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
        pending.toolName,
        toolResult
      );

      steps.push({ type: "completed", description: "Done", timestamp: Date.now() });

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
    description: `Understood intent: ${intent.type.replace(/_/g, " ")} (${Math.round(intent.confidence * 100)}% confidence)`,
    timestamp: Date.now(),
  });

  if (intent.type === "greeting") {
    steps.push({ type: "completed", description: "Greeting response", timestamp: Date.now() });
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
    steps.push({ type: "completed", description: "Help response", timestamp: Date.now() });
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
    steps.push({ type: "completed", description: "Navigation guidance", timestamp: Date.now() });
    return {
      response: {
        id: generateId(),
        role: "assistant",
        content: `You can navigate to **${dest}** using the sidebar menu. Let me know if you need help finding anything specific!`,
        timestamp: Date.now(),
        steps,
      },
      steps,
      newConversationId: conversationId ?? generateId(),
    };
  }

  if (intent.type === "unknown") {
    steps.push({ type: "completed", description: "Could not determine intent", timestamp: Date.now() });
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
    steps.push({ type: "completed", description: "No tool for this intent", timestamp: Date.now() });
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
    description: `Checking access for ${tool.name}...`,
    timestamp: Date.now(),
  });

  const permCheck = checkToolPermissions(user, toolId);
  if (!permCheck.allowed) {
    logBlockedAction(user, toolId, tool.name, permCheck.reason ?? "Permission denied");
    steps.push({ type: "error", description: `Access denied: ${permCheck.reason}`, timestamp: Date.now() });
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
    description: "Permission check passed",
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
    toolCallId: toolCall.id,
    timestamp: Date.now(),
  });

  const toolResult = await executeTool(user, toolCall, token);

  logToolExecution(user, toolCall, tool.name, toolResult);

  steps.push({
    type: "verifying",
    description: toolResult.success
      ? `${tool.name} completed in ${toolResult.executionTimeMs}ms`
      : `${tool.name} failed: ${toolResult.error}`,
    toolCallId: toolCall.id,
    timestamp: Date.now(),
  });

  const responseContent = formatToolResult(tool.name, toolResult);

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
    const id = String(obj.id ?? "");
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
    if (id) parts.push(`ID: \`${String(id).substring(0, 8)}\``);

    lines.push(`- ${parts.join(" | ") || JSON.stringify(item).substring(0, 120)}`);
  }

  if (items.length > 10) {
    lines.push(`\n_...and ${items.length - 10} more_`);
  }

  return lines.join("\n");
}

function formatObjectResult(toolName: string, obj: Record<string, unknown>): string {
  const lines: string[] = [`### ${toolName}\n`];

  const displayKeys = [
    "name", "email", "phone", "status", "created_at",
    "id", "description", "fee_amount", "currency",
    "average", "count", "total", "monthly_amount",
    "period_start", "period_end", "message",
  ];

  let found = false;
  for (const key of displayKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const val = typeof obj[key] === "object" ? JSON.stringify(obj[key]) : String(obj[key]);
      lines.push(`**${key.replace(/_/g, " ")}**: ${val}`);
      found = true;
    }
  }

  if (!found) {
    const keys = Object.keys(obj).slice(0, 8);
    for (const key of keys) {
      const val = typeof obj[key] === "object" ? JSON.stringify(obj[key]) : String(obj[key]);
      lines.push(`**${key.replace(/_/g, " ")}**: ${val.substring(0, 100)}`);
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
    default:
      return `Execute ${toolId}`;
  }
}

function buildConfirmationMessage(
  toolName: string,
  params: Record<string, unknown>
): string {
  const id = params.appointmentId ?? params.notificationId ?? "N/A";
  return (
    `I need your confirmation before proceeding.\n\n` +
    `**Action:** ${toolName}\n` +
    `**Target:** ${id}\n\n` +
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
    `- **Viewing** appointments, patients, doctors, lab tests, and notifications\n` +
    `- **Checking** subscription status, billing, and reports\n` +
    `- **Managing** appointments and lab test workflows\n` +
    `- **Navigating** the dashboard\n\n` +
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
    "### Take Actions",
    "- \"Confirm appointment [ID]\"",
    "- \"Complete appointment [ID]\"",
    "- \"Cancel appointment [ID]\"",
    "- \"Approve lab test appointment [ID]\"",
    "- \"Reject lab test appointment [ID]\"\n",
    "### Navigate",
    "- \"Go to dashboard\"",
    "- \"Open appointments page\"\n",
    "### Tips",
    "- I enforce your **role permissions** at every step",
    "- **Destructive actions** require your explicit confirmation",
    "- I show my **thinking process** as I work through your request",
    "- Your data never leaves this application",
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
    "\"Help\" - to see all available commands",
  ];
  const pick = suggestions.slice(0, 3);

  return (
    `I'm not sure how to help with \"${query.substring(0, 60)}\". ` +
    `Here are some things you can try:\n\n` +
    pick.map((s) => `- ${s}`).join("\n") +
    `\n\nType **\"help\"** to see everything I can do.`
  );
}

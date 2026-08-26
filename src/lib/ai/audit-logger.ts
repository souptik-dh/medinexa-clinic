import type { AiUser, ToolCall, ToolResult } from "./types";

export interface AuditEntry {
  id: string;
  userId: string;
  userRole: string;
  userName: string;
  toolId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  success: boolean;
  error?: string;
  executionTimeMs: number;
  timestamp: number;
  blocked?: boolean;
  blockReason?: string;
}

const MAX_AUDIT_ENTRIES = 1000;
const auditLog: AuditEntry[] = [];

function generateId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function logAuditEntry(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  const record: AuditEntry = {
    ...entry,
    id: generateId(),
    timestamp: Date.now(),
  };

  auditLog.unshift(record);

  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.length = MAX_AUDIT_ENTRIES;
  }

  if (process.env.NODE_ENV === "development") {
    const status = record.blocked ? "BLOCKED" : record.success ? "OK" : "FAIL";
    console.log(
      `[AI Audit] ${status} user=${record.userName}(${record.userRole}) tool=${record.toolName} time=${record.executionTimeMs}ms${record.error ? ` err=${record.error}` : ""}`
    );
  }

  return record;
}

export function logToolExecution(
  user: AiUser,
  toolCall: ToolCall,
  toolName: string,
  result: ToolResult
): AuditEntry {
  return logAuditEntry({
    userId: user.id,
    userRole: user.role,
    userName: user.name,
    toolId: toolCall.toolId,
    toolName,
    parameters: toolCall.parameters,
    success: result.success,
    error: result.error,
    executionTimeMs: result.executionTimeMs,
  });
}

export function logBlockedAction(
  user: AiUser,
  toolId: string,
  toolName: string,
  reason: string
): AuditEntry {
  return logAuditEntry({
    userId: user.id,
    userRole: user.role,
    userName: user.name,
    toolId,
    toolName,
    parameters: {},
    success: false,
    executionTimeMs: 0,
    blocked: true,
    blockReason: reason,
  });
}

export function getAuditLog(limit = 50): AuditEntry[] {
  return auditLog.slice(0, limit);
}

export function getUserAuditLog(userId: string, limit = 50): AuditEntry[] {
  return auditLog.filter((e) => e.userId === userId).slice(0, limit);
}

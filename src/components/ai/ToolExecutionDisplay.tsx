"use client";
import React from "react";
import type { AgentStep } from "@/lib/ai/types";

interface Props {
  steps: AgentStep[];
}

const STEP_COLORS: Record<AgentStep["type"], string> = {
  planning: "text-blue-light-500",
  checking_permissions: "text-warning-500",
  executing: "text-brand-500",
  verifying: "text-purple-500",
  completed: "text-success-500",
  error: "text-error-500",
};

const FALLBACK_ICONS: Record<AgentStep["type"], string> = {
  planning: "🔎",
  checking_permissions: "🔐",
  executing: "⚙️",
  verifying: "📊",
  completed: "✅",
  error: "❌",
};

export default function ToolExecutionDisplay({ steps }: Props) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {steps.map((step, i) => {
        const color = STEP_COLORS[step.type];
        const icon = step.icon ?? FALLBACK_ICONS[step.type];
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-[11px] leading-5 text-gray-400 dark:text-gray-500"
          >
            <span className="shrink-0 text-[11px] leading-none">{icon}</span>
            <span className={color}>{step.description}</span>
          </div>
        );
      })}
    </div>
  );
}

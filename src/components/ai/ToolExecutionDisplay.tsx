"use client";
import React from "react";
import type { AgentStep } from "@/lib/ai/types";

interface Props {
  steps: AgentStep[];
}

const STEP_ICONS: Record<AgentStep["type"], { color: string; icon: string }> = {
  planning: { color: "text-blue-light-500", icon: "P" },
  checking_permissions: { color: "text-warning-500", icon: "C" },
  executing: { color: "text-brand-500", icon: "E" },
  verifying: { color: "text-purple-500", icon: "V" },
  completed: { color: "text-success-500", icon: "D" },
  error: { color: "text-error-500", icon: "!" },
};

export default function ToolExecutionDisplay({ steps }: Props) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {steps.map((step, i) => {
        const config = STEP_ICONS[step.type];
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-[11px] leading-5 text-gray-400 dark:text-gray-500"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ${config.color.replace("text-", "bg-")}`}
            >
              {config.icon}
            </span>
            <span className={config.color}>{step.description}</span>
          </div>
        );
      })}
    </div>
  );
}

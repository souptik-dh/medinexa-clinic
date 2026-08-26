"use client";
import React, { useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import ToolExecutionDisplay from "./ToolExecutionDisplay";

interface Props {
  message: ChatMessage;
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-800 dark:text-white/90 mb-1 mt-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-gray-800 dark:text-white/90 mb-1 mt-3">$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-medium text-gray-800 dark:text-white/90">$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-800">$1</code>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-gray-600 dark:text-gray-400">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-1">$&</ul>');
  html = html.replace(/^_([^_]+)_$/gm, '<em class="text-gray-400 dark:text-gray-500">$1</em>');
  html = html.replace(/\n/g, "<br />");

  return html;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const [showSteps, setShowSteps] = useState(false);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-brand-500 px-3.5 py-2.5 text-sm text-white dark:bg-brand-600">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-brand-500"
          >
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
          </svg>
        </div>
        <div className="max-w-[85%]">
          <div
            className="rounded-lg bg-white px-3.5 py-2.5 text-sm text-gray-700 shadow-theme-xs dark:bg-gray-800 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />

          {message.steps && message.steps.length > 0 && (
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${showSteps ? "rotate-90" : ""}`}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              {showSteps ? "Hide" : "Show"} agent steps
            </button>
          )}

          {showSteps && message.steps && (
            <ToolExecutionDisplay steps={message.steps} />
          )}
        </div>
      </div>
    </div>
  );
}

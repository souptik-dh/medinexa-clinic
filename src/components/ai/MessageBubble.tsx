"use client";
import React, { useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import ToolExecutionDisplay from "./ToolExecutionDisplay";
import { useTranslation } from "@/hooks/useTranslation";

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

  const lines = html.split("\n");
  const processed: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("|") && i + 1 < lines.length && lines[i + 1].startsWith("|")) {
      const headerCells = lines[i].split("|").filter((c) => c.trim());
      processed.push('<div class="my-2 overflow-x-auto"><table class="w-full text-[11px] border-collapse">');
      processed.push("<thead><tr>");
      for (const cell of headerCells) {
        processed.push(`<th class="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800">${cell.trim()}</th>`);
      }
      processed.push("</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").filter((c) => c.trim());
        processed.push("<tr>");
        for (const cell of cells) {
          processed.push(`<td class="border border-gray-200 dark:border-gray-700 px-2 py-1 text-gray-600 dark:text-gray-400">${cell.trim()}</td>`);
        }
        processed.push("</tr>");
        i++;
      }
      processed.push("</tbody></table></div>");
    } else {
      processed.push(lines[i]);
      i++;
    }
  }

  html = processed.join("\n");
  html = html.replace(/\n/g, "<br />");

  return html;
}

export default function MessageBubble({ message }: Props) {
  const { t } = useTranslation();
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

          {message.navigationLinks && message.navigationLinks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.navigationLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-400 dark:hover:bg-brand-900"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {link.label}
                </a>
              ))}
            </div>
          )}

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
              {showSteps ? t("aiAssistant.hideSteps") : t("aiAssistant.showSteps")}
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

"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { useAiChat } from "@/context/AiChatContext";
import MessageBubble from "./MessageBubble";
import ConfirmationDialog from "./ConfirmationDialog";
import { useTranslation } from "@/hooks/useTranslation";

const QUICK_ACTIONS = [
  "Show today's appointments",
  "Show monthly revenue",
  "List my patients",
  "Check notifications",
  "Subscription status",
  "Find a doctor",
  "Give me a daily summary",
  "What can you do?",
];

export default function ChatPanel() {
  const {
    isOpen,
    messages,
    isLoading,
    pendingConfirmation,
    sendMessage,
    respondConfirmation,
    clearMessages,
  } = useAiChat();
  const { t, locale, setLocale } = useTranslation();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages, isLoading]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (!isOpen) return null;

  const showWelcome = messages.length === 0;

  return (
    <div className="fixed bottom-24 right-6 z-[99998] flex h-[500px] max-h-[calc(100vh-8rem)] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-theme-xl dark:border-gray-800 dark:bg-gray-900 sm:w-[420px]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-brand-600 bg-brand-500 px-4 py-3 dark:bg-brand-600">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white"
          >
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">
            {t("aiAssistant.title")}
          </h3>
          <p className="text-[11px] text-brand-100">
            {t("aiAssistant.subtitle")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setLocale(locale === "en" ? "bn" : "en")}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-white/70 transition hover:bg-white/20 hover:text-white"
            title={t(`language.${locale === "en" ? "bn" : "en"}`)}
          >
            {locale === "en" ? "বাংলা" : "EN"}
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="rounded-md p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
              title={t("aiAssistant.newChat")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
          <span className="flex h-2 w-2 rounded-full bg-white">
            <span className="absolute h-2 w-2 animate-ping rounded-full bg-white opacity-75" />
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-3" style={{ backgroundColor: "rgba(70, 95, 255, 0.06)" }}>
        {showWelcome ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-brand-500"
              >
                <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
              </svg>
            </div>
            <h4 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {t("aiAssistant.howCanIHelp")}
            </h4>
            <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
              {t("aiAssistant.canSearchAndManage")}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {pendingConfirmation && (
              <ConfirmationDialog
                toolName={pendingConfirmation.toolName}
                description={pendingConfirmation.description}
                onConfirm={() => respondConfirmation(true)}
                onCancel={() => respondConfirmation(false)}
              />
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" />
                </div>
                <span>{t("aiAssistant.thinking")}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-brand-100 bg-white px-3 py-3 dark:border-brand-900 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("aiAssistant.placeholder")}
            disabled={isLoading || !!pendingConfirmation}
            className="flex-1 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-400 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950/50 dark:text-white dark:placeholder-gray-500 dark:focus:border-brand-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !!pendingConfirmation}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-brand-300 dark:text-brand-700">
          {t("aiAssistant.footerDisclaimer")}
        </p>
      </div>
    </div>
  );
}

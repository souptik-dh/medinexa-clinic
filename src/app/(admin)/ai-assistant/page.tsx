"use client";
import React, { useEffect } from "react";
import { useAiChat } from "@/context/AiChatContext";
import MessageBubble from "@/components/ai/MessageBubble";
import ConfirmationDialog from "@/components/ai/ConfirmationDialog";
import { useTranslation } from "@/hooks/useTranslation";

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const {
    messages,
    isLoading,
    pendingConfirmation,
    openChat,
    sendMessage,
    respondConfirmation,
  } = useAiChat();

  const QUICK_ACTIONS = [
    { label: t("aiAssistant.quickActions.todaysAppointments"), message: t("aiAssistant.quickActions.todaysAppointmentsMsg") },
    { label: t("aiAssistant.quickActions.myPatients"), message: t("aiAssistant.quickActions.myPatientsMsg") },
    { label: t("aiAssistant.quickActions.findADoctor"), message: t("aiAssistant.quickActions.findADoctorMsg") },
    { label: t("aiAssistant.quickActions.notifications"), message: t("aiAssistant.quickActions.notificationsMsg") },
    { label: t("aiAssistant.quickActions.subscription"), message: t("aiAssistant.quickActions.subscriptionMsg") },
    { label: t("aiAssistant.quickActions.labTests"), message: t("aiAssistant.quickActions.labTestsMsg") },
    { label: t("aiAssistant.quickActions.staffList"), message: t("aiAssistant.quickActions.staffListMsg") },
    { label: t("aiAssistant.quickActions.help"), message: t("aiAssistant.quickActions.helpMsg") },
  ];

  useEffect(() => {
    openChat();
  }, [openChat]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">
          {t("aiAssistant.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("aiAssistant.pageSubtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => sendMessage(action.message)}
            className="rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/10">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-brand-500"
              >
                <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
              {action.label}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {action.message}
            </p>
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
            {t("aiAssistant.recentConversation")}
          </h2>
          <div className="space-y-3">
            {messages.slice(-6).map((msg) => (
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
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" />
                </div>
                <span>{t("aiAssistant.thinking")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

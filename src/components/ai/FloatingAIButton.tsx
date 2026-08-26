"use client";
import React from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  isOpen: boolean;
  onClick: () => void;
}

export default function FloatingAIButton({ isOpen, onClick }: Props) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? t("aiAssistant.closeAssistant") : t("aiAssistant.openAssistant")}
      className={`
        fixed bottom-6 right-6 z-[99999] flex h-14 w-14 items-center justify-center
        rounded-full shadow-theme-lg transition-all duration-300
        hover:scale-105 hover:shadow-theme-xl active:scale-95
        ${
          isOpen
            ? "bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            : "bg-brand-500 hover:bg-brand-600"
        }
      `}
    >
      {isOpen ? (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      ) : (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white"
        >
          <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
        </svg>
      )}
    </button>
  );
}

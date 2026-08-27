"use client";
import React, { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";

// Right-side slide-over used for all Add/Edit/Configure actions inside the
// Clinics module. Keeps the user on the current tab — the action opens over
// the page and closes straight back into it. Becomes a full-screen sheet on
// small screens where a side panel would be too cramped.
interface FormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Optional sticky footer (e.g. form action buttons). */
  footer?: React.ReactNode;
}

export default function FormDrawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}: FormDrawerProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-99999 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl duration-300 [animation:fd-slide-in_.25s_ease-out] dark:bg-gray-900 sm:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-800 dark:text-white/90">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t("appointments.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 dark:text-white sm:px-6">
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
            {footer}
          </div>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes fd-slide-in{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}`,
        }}
      />
    </div>
  );
}

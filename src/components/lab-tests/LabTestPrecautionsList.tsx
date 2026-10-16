"use client";
import React from "react";
import { useTranslation } from "@/hooks/useTranslation";

// Shared by both the master LabTestPrecaution and a booking's own copy, which
// only differ in whether `id` may be null.
type PrecautionLike = { name: string; description: string };

interface LabTestPrecautionsListProps {
  precautions: PrecautionLike[] | null | undefined;
  /** Optional line under the title, e.g. "Share these with the patient…". */
  hint?: string;
  /** Drop the card chrome when the parent already provides one. */
  plain?: boolean;
}

/**
 * Read-only "Test Preparation & Precautions" card: the precautions selected for
 * a test (while booking) or saved on a booking. Renders nothing when empty.
 */
export default function LabTestPrecautionsList({
  precautions,
  hint,
  plain = false,
}: LabTestPrecautionsListProps) {
  const { t } = useTranslation();
  const items = precautions ?? [];
  if (items.length === 0) return null;

  return (
    <section
      aria-label={t("labTestPrecautions.title")}
      className={
        plain
          ? ""
          : "rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-500/[0.06]"
      }
    >
      <div className="mb-2 flex items-start gap-2">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>
          <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
            {t("labTestPrecautions.title")}
          </span>
          {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
        </span>
      </div>
      <ol className="space-y-1.5 pl-6">
        {items.map((p, i) => (
          <li key={`${p.name}-${i}`} className="list-disc text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-800 dark:text-white/90">{p.name}</span>
            {p.description && (
              <span className="text-gray-500 dark:text-gray-400"> — {p.description}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

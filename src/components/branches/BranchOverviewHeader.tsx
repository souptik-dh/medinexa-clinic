"use client";
import React from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";

interface BranchOverviewHeaderProps {
  clinicId: string;
  branchName: string;
}

export default function BranchOverviewHeader({
  clinicId,
  branchName,
}: BranchOverviewHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex items-center gap-3">
      <Link
        href={`/clinics/${clinicId}/branches`}
        aria-label={t("clinicsPage.branches")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{branchName}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("clinicsPage.overview")}</p>
      </div>
    </div>
  );
}

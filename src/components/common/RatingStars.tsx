"use client";
import React from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface RatingStarsProps {
  average: number | null;
  count: number;
  size?: "sm" | "md";
  className?: string;
  hideCount?: boolean;
}

function Star({ fill }: { fill: number }) {
  const id = React.useId();
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" className="shrink-0">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="currentColor" />
          <stop offset={`${fill * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.8l-5.2 2.9 1-5.9-4.3-4.1 5.9-.8z"
        fill={`url(#${id})`}
        stroke="currentColor"
        strokeWidth="1"
        className="text-warning-400"
      />
    </svg>
  );
}

export default function RatingStars({
  average,
  count,
  size = "md",
  className = "",
  hideCount = false,
}: RatingStarsProps) {
  const { t } = useTranslation();
  const textClass = size === "sm" ? "text-theme-xs" : "text-sm";

  if (average === null || count <= 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 dark:text-gray-500 ${textClass} ${className}`}>
        {t("reviews.noRatingsYet")}
      </span>
    );
  }

  const clampedAverage = Math.max(0, Math.min(5, average));
  const stars = Array.from({ length: 5 }, (_, i) => Math.max(0, Math.min(1, clampedAverage - i)));

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="flex items-center gap-0.5">
        {stars.map((fill, i) => (
          <Star key={i} fill={fill} />
        ))}
      </span>
      <span className={`font-medium text-gray-700 dark:text-gray-300 ${textClass}`}>
        {clampedAverage.toFixed(1)}
      </span>
      {!hideCount && (
        <span className={`text-gray-400 dark:text-gray-500 ${textClass}`}>
          ({count})
        </span>
      )}
    </span>
  );
}

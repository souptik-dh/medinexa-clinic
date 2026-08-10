"use client";
import React from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export default function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={`group relative ${className ?? "inline-block"}`}>
      {children}
      <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 w-max max-w-xs -translate-x-1/2 scale-95 whitespace-pre-line rounded-lg bg-gray-900 px-3 py-2 text-left text-xs text-white opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 dark:bg-gray-700">
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900 dark:border-b-gray-700" />
        {content}
      </span>
    </span>
  );
}

"use client";
import React from "react";

interface Props {
  toolName: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  toolName,
  description,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="mt-3 rounded-lg border border-warning-200 bg-warning-25 p-3 dark:border-warning-800/30 dark:bg-warning-950/20">
      <div className="mb-2 flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-warning-500"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
        <span className="text-xs font-medium text-warning-700 dark:text-warning-400">
          Confirmation Required
        </span>
      </div>
      <p className="mb-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="font-medium">{toolName}</span>
      </p>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-500">
        {description}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-md bg-success-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-success-600"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";
import React from "react";

export default function AiSettingsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">
          AI Assistant Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure your AI assistant preferences and view activity logs.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          General Settings
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Floating Chat Button
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Show the AI assistant floating button on all pages
              </p>
            </div>
            <span className="rounded-full bg-success-100 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-500/20 dark:text-success-400">
              Enabled
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirmation for Destructive Actions
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Require explicit confirmation before modifying data
              </p>
            </div>
            <span className="rounded-full bg-success-100 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-500/20 dark:text-success-400">
              Enabled
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Permission Enforcement
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                All tool calls respect your role-based access permissions
              </p>
            </div>
            <span className="rounded-full bg-success-100 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-500/20 dark:text-success-400">
              Active
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          Security & Rate Limits
        </h2>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Max requests per minute</span>
            <span className="font-medium text-gray-800 dark:text-white/90">30</span>
          </div>
          <div className="flex justify-between">
            <span>Max tool calls per minute</span>
            <span className="font-medium text-gray-800 dark:text-white/90">60</span>
          </div>
          <div className="flex justify-between">
            <span>Max tool calls per request</span>
            <span className="font-medium text-gray-800 dark:text-white/90">10</span>
          </div>
          <div className="flex justify-between">
            <span>Request timeout</span>
            <span className="font-medium text-gray-800 dark:text-white/90">30s</span>
          </div>
          <div className="flex justify-between">
            <span>Data leak protection</span>
            <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-500/20 dark:text-success-400">
              Active
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

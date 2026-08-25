"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import { ApiError, SubscriptionTrialView, subscriptionsApi } from "@/lib/api";
import {
  formatDate,
  subscriptionStatusColor,
  subscriptionStatusLabel,
} from "@/lib/utils";

// Trial/subscription summary shown on the clinic overview page, powered by
// GET /clinics/:id/subscription/trial.
export default function SubscriptionTrialWidget({ clinicId }: { clinicId: string }) {
  const [view, setView] = useState<SubscriptionTrialView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    subscriptionsApi
      .trial(clinicId)
      .then((res) => !cancelled && setView(res))
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Failed to load subscription info")
      );
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-error-500 dark:border-gray-800 dark:bg-white/[0.03]">
        {error}
      </div>
    );
  }
  if (!view) return null;

  const { trial } = view;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Subscription
        </h3>
        <Link
          href="/billing"
          className="rounded-lg border border-brand-500/40 px-3 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
        >
          Manage billing →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Status
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge color={subscriptionStatusColor(view.subscription_status)}>
              {subscriptionStatusLabel(view.subscription_status)}
            </Badge>
            {view.subscription_status === "TRIAL" && (
              <Badge color="info">Free trial</Badge>
            )}
          </div>
        </div>

        {/* trial.* flags freeze once the clinic converts to paid (API.md:
            "CONCLUDED") — only trust them while still on TRIAL status. */}
        {view.subscription_status === "TRIAL" && (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Trial ends
              </p>
              <p className="mt-1 text-sm text-gray-800 dark:text-white/90">
                {trial.ends_at ? formatDate(trial.ends_at) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Days left
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  trial.expiring_soon
                    ? "text-warning-600 dark:text-orange-400"
                    : "text-gray-800 dark:text-white/90"
                }`}
              >
                {trial.days_remaining}
              </p>
            </div>
          </>
        )}

        {view.subscription_status !== "TRIAL" && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Plan price
            </p>
            <p className="mt-1 text-sm text-gray-800 dark:text-white/90">
              ₹{view.monthly_amount.toLocaleString()}{" "}
              <span className="text-xs font-normal text-gray-400">/ month</span>
            </p>
          </div>
        )}
      </div>

      {/* Only warn about a lapsed trial while the clinic is actually still on
          trial status — trial.expired stays true forever after payment. */}
      {view.subscription_status === "TRIAL" && trial.expired && !view.blocked && (
        <p className="mt-4 rounded-xl bg-warning-50 p-3 text-xs text-warning-700 dark:bg-orange-500/10 dark:text-orange-400">
          Your free trial has ended. Pay now to keep appointments, lab tests and
          prescriptions running.
        </p>
      )}
      {view.blocked && (
        <p className="mt-4 rounded-xl bg-error-50 p-3 text-xs text-error-700 dark:bg-error-500/10 dark:text-error-400">
          {view.blocked_reason ||
            "Your clinic is currently read-only because the subscription is inactive."}{" "}
          <Link href="/billing" className="font-semibold underline">
            Renew now
          </Link>
        </p>
      )}
    </div>
  );
}

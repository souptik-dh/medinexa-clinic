"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SubscriptionDetailResponse, subscriptionsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useClinicId } from "@/hooks/useClinicId";
import { useAuth } from "@/context/AuthContext";

// Announcement banner shown across the clinic portal while the clinic is
// inside its free-trial window - surfaces the plan name, price and trial
// length (GET /clinics/:id/subscription is reachable while on trial).
export default function SubscriptionTrialBanner() {
  const { user } = useAuth();
  const clinicId = useClinicId();
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isClinicOwner = user?.role === "clinic_owner";

  useEffect(() => {
    if (!isClinicOwner || !clinicId) return;
    let cancelled = false;
    subscriptionsApi
      .get(clinicId)
      .then((res) => !cancelled && setDetail(res))
      .catch(() => {
        // No banner on failure - the billing page remains the source of truth.
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isClinicOwner, clinicId]);

  const subscription = detail?.subscription;
  const plan = detail?.current_plan;
  const inTrial = !!subscription && (subscription.is_trial || subscription.status === "TRIAL");

  if (!isClinicOwner || !inTrial || dismissed || !plan) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 shadow-sm sm:flex-row sm:items-center md:mb-6 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
      <p className="flex-1">
        <span className="font-semibold">{plan.name}</span>
        {" · "}
        {formatCurrency(plan.monthly_amount, plan.currency)} / month
        {plan.trial_months ? ` (${plan.trial_months}-month free trial)` : ""}
        {subscription && (
          <span className="ml-2 text-xs opacity-80">
            {subscription.days_remaining} day{subscription.days_remaining === 1 ? "" : "s"} left
          </span>
        )}
      </p>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <Link
          href="/billing"
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600"
        >
          Go to Billing
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/15"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_INACTIVE_EVENT } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

// Listens for 402 SUBSCRIPTION_INACTIVE errors raised anywhere in the app
// (apiFetch broadcasts them) and shows a persistent banner linking to /billing.
export default function SubscriptionGateBanner() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      setMessage(detail || t("subscription.defaultInactiveMessage"));
      setDismissed(false);
    };
    window.addEventListener(SUBSCRIPTION_INACTIVE_EVENT, handler);
    return () => window.removeEventListener(SUBSCRIPTION_INACTIVE_EVENT, handler);
  }, []);

  if (!message || dismissed) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-40 mx-auto w-full max-w-(--breakpoint-2xl) px-4 md:px-6">
      <div className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 shadow-lg sm:flex-row sm:items-center dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
        <p className="flex-1">
          <span className="font-semibold">{t("subscription.inactive")}</span> {message}
        </p>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Link
            href="/billing"
            className="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-error-600"
          >
            {t("subscription.goToBilling")}
          </Link>
          <button
            onClick={() => setDismissed(true)}
            aria-label={t("subscription.dismiss")}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-700 hover:bg-error-100 dark:text-error-400 dark:hover:bg-error-500/15"
          >
            {t("subscription.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}

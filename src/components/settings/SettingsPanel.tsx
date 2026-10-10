"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { clinicsApi } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { Locale } from "@/locales";

interface SettingsItem {
  labelKey: string;
  href: string;
  hint?: string;
}

interface SettingsSection {
  titleKey: string;
  items: SettingsItem[];
}

export default function SettingsPanel() {
  const { t, locale, setLocale } = useTranslation();
  const { user, clinic } = useAuth();
  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const [resolvedClinicId, setResolvedClinicId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner || clinic?.id) return;
    let active = true;
    clinicsApi
      .list({ limit: 1 })
      .then((res) => {
        if (active && res.items[0]) setResolvedClinicId(res.items[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOwner, clinic]);

  const clinicId = clinic?.id ?? resolvedClinicId;

  const sections: SettingsSection[] = [
    {
      titleKey: "settings.account",
      items: [{ labelKey: "settings.profile", href: "/profile" }],
    },
  ];

  if (isOwner && clinicId) {
    sections.push({
      titleKey: "settings.clinic",
      items: [
        { labelKey: "settings.clinicOverview", href: `/clinics/${clinicId}/overview` },
        {
          labelKey: "settings.manageBranches",
          href: `/clinics/${clinicId}/overview?tab=branches`,
        },
      ],
    });
  }

  sections.push({
    titleKey: "settings.notifications",
    items: [{ labelKey: "settings.notificationSettings", href: "/notifications" }],
  });

  if (isOwner) {
    sections.push({
      titleKey: "settings.billing",
      items: [{ labelKey: "settings.manageSubscription", href: "/billing" }],
    });
  }

  const languages: { value: Locale; label: string }[] = [
    { value: "en", label: t("language.en") },
    { value: "bn", label: t("language.bn") },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {sections.map((section) => (
        <div
          key={section.titleKey}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"
        >
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
            {t(section.titleKey)}
          </h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-gray-700 transition hover:text-brand-500 dark:text-gray-300 dark:hover:text-brand-400"
                >
                  {t(item.labelKey)}
                  <span aria-hidden className="text-gray-400">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
          {t("settings.language")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {languages.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLocale(l.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                locale === l.value
                  ? "bg-brand-500 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

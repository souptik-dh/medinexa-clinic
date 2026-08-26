"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import type { Locale } from "@/locales";

const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale, t } = useLanguage();

  const options: { value: Locale; label: string }[] = [
    { value: "en", label: "EN" },
    { value: "bn", label: "বাংলা" },
  ];

  return (
    <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLocale(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            locale === opt.value
              ? "bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-white/90"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
          title={t(`language.${opt.value}`)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;

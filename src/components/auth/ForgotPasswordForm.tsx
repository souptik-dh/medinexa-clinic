"use client";
import Link from "next/link";
import React, { useState } from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ApiError, authApi } from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import { useTranslation } from "@/hooks/useTranslation";

type RequiredField = "email";

export default function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!email.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await authApi.forgotPassword(email);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.unableToRequestReset"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t("auth.forgotPasswordTitle")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auth.forgotPasswordDesc")}
            </p>
          </div>

          {message ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                {message}
              </div>
              <Link
                href="/signin"
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("auth.backToSignIn")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>
                  {t("auth.email")} <span className="text-error-500">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder="owner@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch("email")}
                  error={showError("email", !email.trim())}
                  hint={showError("email", !email.trim()) ? REQUIRED_FIELD_MESSAGE : undefined}
                  required
                />
              </div>
              {error && (
                <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <Button className="w-full" size="sm" disabled={submitting}>
                  {submitting ? t("auth.sending") : t("auth.sendResetLink")}
                </Button>
              </div>
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400">
                {t("auth.rememberedPassword")}{" "}
                <Link
                  href="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.signIn")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

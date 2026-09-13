"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useState } from "react";
import Input from "@/components/form/input/InputField";
import OtpInput from "@/components/form/input/OtpInput";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { ApiError, authApi } from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import { useTranslation } from "@/hooks/useTranslation";
import { isValidPhone, PHONE_VALIDATION_MESSAGE, sanitizePhoneDigits } from "@/lib/phone";

type RequiredField = "phone" | "otp" | "newPassword" | "confirmPassword";

export default function NewPasswordForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const phoneFromLink = searchParams.get("phone");

  const [phone, setPhone] = useState(phoneFromLink ?? "");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!isValidPhone(phone) || !otp.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await authApi.resetPassword({
        phone,
        otp,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.unableToResetPassword"));
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
              {t("auth.newPasswordTitle")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auth.newPasswordDesc")}
            </p>
          </div>

          {message ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                {message}
              </div>
              <Link
                href="/signin"
                className="block w-full rounded-lg bg-brand-500 px-4 py-3 text-center text-sm font-medium text-white hover:bg-brand-600"
              >
                {t("auth.goToSignIn")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>
                  {t("auth.phone")} <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-[22px] z-10 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                    +91
                  </span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className="pl-12"
                    placeholder={t("auth.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                    onBlur={() => touch("phone")}
                    error={showError("phone", phone.trim() !== "" && !isValidPhone(phone))}
                    hint={
                      showError("phone", phone.trim() !== "" && !isValidPhone(phone))
                        ? PHONE_VALIDATION_MESSAGE
                        : undefined
                    }
                    required
                  />
                </div>
              </div>
              <div>
                <Label>
                  {t("auth.otp")} <span className="text-error-500">*</span>
                </Label>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onBlur={() => touch("otp")}
                  error={showError("otp", !otp.trim())}
                />
                {showError("otp", !otp.trim()) && (
                  <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                )}
              </div>
              <div>
                <Label>
                  {t("auth.newPassword")} <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onBlur={() => touch("newPassword")}
                    error={showError("newPassword", !newPassword.trim())}
                    required
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
                {showError("newPassword", !newPassword.trim()) && (
                  <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                )}
              </div>
              <div>
                <Label>
                  {t("auth.confirmPassword")} <span className="text-error-500">*</span>
                </Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => touch("confirmPassword")}
                  error={showError("confirmPassword", !confirmPassword.trim())}
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
                  {submitting ? t("auth.saving") : t("auth.resetPassword")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import { useTranslation } from "@/hooks/useTranslation";
import { isValidPhone, PHONE_VALIDATION_MESSAGE, sanitizePhoneDigits } from "@/lib/phone";

type RequiredField = "phone" | "password";

export default function SuperAdminSignInForm() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { superAdminLogin, user, isAuthReady } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("reason") === "session_expired";
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  // An already-authenticated sys_admin has no business on this page - send
  // them straight to the platform console.
  useEffect(() => {
    if (isAuthReady && user?.role === "sys_admin") {
      router.replace("/super-admin");
    }
  }, [isAuthReady, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!isValidPhone(phone) || !password.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await superAdminLogin(phone, password);
      router.push("/super-admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.unableToSignIn"));
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
              {t("auth.superAdminTitle")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auth.superAdminDesc")}
            </p>
          </div>

          {sessionExpired && (
            <div className="mb-5 rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:bg-warning-500/10 dark:text-warning-400">
              {t("auth.sessionExpired")}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label>
                {t("auth.phone")} <span className="text-error-500">*</span>{" "}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-[22px] -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
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
                {t("auth.password")} <span className="text-error-500">*</span>{" "}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.enterPasswordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => touch("password")}
                  error={showError("password", !password.trim())}
                  hint={showError("password", !password.trim()) ? REQUIRED_FIELD_MESSAGE : undefined}
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
            </div>
            {error && (
              <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {error}
              </div>
            )}
            <div>
              <Button className="w-full" size="sm" disabled={submitting}>
                {submitting ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

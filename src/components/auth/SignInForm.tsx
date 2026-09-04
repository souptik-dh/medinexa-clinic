"use client";
import Input from "@/components/form/input/InputField";
import OtpInput from "@/components/form/input/OtpInput";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import { useTranslation } from "@/hooks/useTranslation";
import { isValidPhone, PHONE_VALIDATION_MESSAGE, sanitizePhoneDigits } from "@/lib/phone";

type Mode = "owner" | "staff" | "doctor";
type LoginMethod = "otp" | "password";
type RequiredField = "phone" | "otp" | "password";

export default function SignInForm() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("owner");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("otp");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    sendOwnerLoginOtp,
    verifyOwnerOtp,
    loginOwnerWithPassword,
    sendDoctorLoginOtp,
    verifyDoctorOtp,
    staffLogin,
    verifyStaffOtp,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("reason") === "session_expired";
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const requestOtp = async (phoneValue: string) => {
    setSubmitted(true);
    if (!isValidPhone(phoneValue)) {
      setError(PHONE_VALIDATION_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "owner") {
        const msg = await sendOwnerLoginOtp(phoneValue);
        setMessage(msg);
      } else if (mode === "doctor") {
        const msg = await sendDoctorLoginOtp(phoneValue);
        setMessage(msg);
      } else {
        await staffLogin(phoneValue);
        setMessage(t("auth.otpSentPhoneMessage"));
      }
      setStage("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.unableToRequestOtp"));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setSubmitted(true);
    if (!otp.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "owner") {
        await verifyOwnerOtp(phone, otp);
      } else if (mode === "doctor") {
        await verifyDoctorOtp(phone, otp);
      } else {
        await verifyStaffOtp(phone, otp);
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.unableToVerifyOtp"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    requestOtp(phone);
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    verifyOtp();
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!isValidPhone(phone) || !password.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await loginOwnerWithPassword(phone, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.unableToSignIn"));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setLoginMethod("otp");
    setStage("request");
    setError(null);
    setMessage(null);
    setPhone("");
    setPassword("");
    setOtp("");
    setSubmitted(false);
  };

  const switchLoginMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    setStage("request");
    setError(null);
    setMessage(null);
    setPassword("");
    setOtp("");
    setSubmitted(false);
  };

  const tabClass = (m: Mode) =>
    `flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
      mode === m
        ? "bg-white text-gray-800 shadow-sm dark:bg-gray-800 dark:text-white/90"
        : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
    }`;

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t("auth.signIn")}
            </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {mode === "owner"
                  ? t("auth.signInClinicOwner")
                  : mode === "doctor"
                    ? t("auth.signInDoctor")
                    : t("auth.signInStaff")}
              </p>
          </div>

          {sessionExpired && (
            <div className="mb-5 rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:bg-warning-500/10 dark:text-warning-400">
              {t("auth.sessionExpired")}
            </div>
          )}

          <div className="mb-6 flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800/50">
            <button
              type="button"
              onClick={() => switchMode("owner")}
              className={tabClass("owner")}
            >
              {t("auth.clinicOwner")}
            </button>
            <button
              type="button"
              onClick={() => switchMode("staff")}
              className={tabClass("staff")}
            >
              {t("auth.staff")}
            </button>
            {/* Doctor login - disabled for now, will open later.
            <button
              type="button"
              onClick={() => switchMode("doctor")}
              className={tabClass("doctor")}
            >
              {t("auth.doctor")}
            </button>
            */}
          </div>

          {mode === "owner" && loginMethod === "password" ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
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
                  {t("auth.password")} <span className="text-error-500">*</span>
                </Label>
                <Input
                  type="password"
                  placeholder={t("auth.enterPasswordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => touch("password")}
                  error={showError("password", !password.trim())}
                  hint={showError("password", !password.trim()) ? REQUIRED_FIELD_MESSAGE : undefined}
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
                  {submitting ? t("auth.signingIn") : t("auth.signIn")}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => switchLoginMethod("otp")}
                  className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.signInWithOtpInstead")}
                </button>
                <Link
                  href="/reset-password"
                  className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.forgotPassword")}
                </Link>
              </div>
            </form>
          ) : stage === "request" ? (
            <form onSubmit={handleRequestSubmit} className="space-y-6">
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
              {error && (
                <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <Button className="w-full" size="sm" disabled={submitting}>
                  {submitting ? t("auth.sendingOtp") : t("auth.sendOtp")}
                </Button>
              </div>
              {mode === "owner" && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => switchLoginMethod("password")}
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    {t("auth.signInWithPasswordInstead")}
                  </button>
                  <Link
                    href="/reset-password"
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifySubmit} className="space-y-6">
              <div>
                <Label>{t("auth.otp")} <span className="text-error-500">*</span> </Label>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onBlur={() => touch("otp")}
                  error={showError("otp", !otp.trim())}
                  autoFocus
                />
                {showError("otp", !otp.trim()) ? (
                  <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                ) : (
                  <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                    {t("auth.enterOtpSentToPhone", { phone })}
                  </p>
                )}
              </div>
              {message && (
                <div className="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                  {message}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div className="space-y-3">
                <Button className="w-full" size="sm" disabled={submitting}>
                  {submitting ? t("auth.verifying") : t("auth.verifyAndSignIn")}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("request");
                    setOtp("");
                    setError(null);
                    setMessage(null);
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {t("auth.back")}
                </button>
              </div>
            </form>
          )}

          {mode === "owner" && (
            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                {t("auth.dontHaveAccount")} {""}
                <Link
                  href="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.signUp")}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

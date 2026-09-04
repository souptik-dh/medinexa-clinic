"use client";
import toast from "react-hot-toast";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import OtpInput from "@/components/form/input/OtpInput";
import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import { markAutoBranchPending } from "@/lib/autoCreateBranch";
import { PHONE_VALIDATION_MESSAGE, isValidPhone, sanitizePhoneDigits } from "@/lib/phone";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

type RequiredField = "firstName" | "lastName" | "phone" | "otp";

export default function SignUpForm() {
  const { t } = useTranslation();
  const [isChecked, setIsChecked] = useState(false);
  const [autoCreateBranch, setAutoCreateBranch] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { sendOwnerRegisterOtp, verifyOwnerRegisterOtp } = useAuth();
  const router = useRouter();
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const requestOtp = async () => {
    setError(null);
    setSubmitted(true);
    const name = `${firstName} ${lastName}`.trim();
    if (!firstName.trim() || !lastName.trim() || !isValidPhone(phone)) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const msg = await sendOwnerRegisterOtp({
        name,
        clinicName: clinicName || name,
        phone,
        email: email.trim() || undefined,
      });
      setMessage(msg ?? t("auth.otpSentPhoneMessage"));
      setStage("verify");
    } catch (err) {
      const message = getErrorMessage(err, t("auth.unableToCreateAccount"));
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setSubmitted(true);
    const name = `${firstName} ${lastName}`.trim();
    if (!otp.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await verifyOwnerRegisterOtp({
        name,
        clinicName: clinicName || name,
        phone,
        email: email.trim() || undefined,
        otp,
      });
      if (autoCreateBranch && result.clinicId) {
        markAutoBranchPending(result.clinicId);
      }
      toast.success(t("auth.accountCreatedSuccess"));
      router.push("/dashboard");
    } catch (err) {
      const message = getErrorMessage(err, t("auth.unableToCreateAccount"));
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t("auth.signUp")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auth.createAccount")}
            </p>
          </div>

          {stage === "request" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                requestOtp();
              }}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <Label>
                    {t("auth.firstName")}<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="fname"
                    name="fname"
                    placeholder={t("auth.firstNamePlaceholder")}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onBlur={() => touch("firstName")}
                    error={showError("firstName", !firstName.trim())}
                    hint={
                      showError("firstName", !firstName.trim())
                        ? REQUIRED_FIELD_MESSAGE
                        : undefined
                    }
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label>
                    {t("auth.lastName")}<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="lname"
                    name="lname"
                    placeholder={t("auth.lastNamePlaceholder")}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onBlur={() => touch("lastName")}
                    error={showError("lastName", !lastName.trim())}
                    hint={
                      showError("lastName", !lastName.trim())
                        ? REQUIRED_FIELD_MESSAGE
                        : undefined
                    }
                    required
                  />
                </div>
              </div>
              <div>
                <Label>{t("auth.clinicName")}</Label>
                <Input
                  type="text"
                  id="clinicName"
                  name="clinicName"
                  placeholder={t("auth.clinicNamePlaceholder")}
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
              <div>
                <Label>
                  {t("auth.phone")}<span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-[22px] z-10 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                    +91
                  </span>
                  <Input
                    type="tel"
                    id="phone"
                    name="phone"
                    inputMode="numeric"
                    maxLength={10}
                    className="pl-12"
                    placeholder={t("auth.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                    onBlur={() => touch("phone")}
                    error={showError("phone", !isValidPhone(phone))}
                    hint={
                      showError("phone", !isValidPhone(phone))
                        ? PHONE_VALIDATION_MESSAGE
                        : undefined
                    }
                    required
                  />
                </div>
              </div>
              <div>
                <Label>{t("auth.email")}</Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  className="w-5 h-5 mt-0.5"
                  checked={autoCreateBranch}
                  onChange={setAutoCreateBranch}
                />
                <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                  {t("auth.autoCreateBranch")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  className="w-5 h-5"
                  checked={isChecked}
                  onChange={setIsChecked}
                />
                <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                  {t("auth.agreeToTerms")}
                </p>
              </div>
              {error && (
                <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <button
                  type="submit"
                  disabled={submitting || !isChecked}
                  className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300"
                >
                  {submitting ? t("auth.sendingOtp") : t("auth.sendOtp")}
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyOtp();
              }}
              className="space-y-5"
            >
              <div>
                {message && (
                  <div className="mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                    {message}
                  </div>
                )}
                <Label>
                  {t("auth.otp")}<span className="text-error-500">*</span>
                </Label>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onBlur={() => touch("otp")}
                  error={showError("otp", !otp.trim())}
                  autoFocus
                />
                {showError("otp", !otp.trim()) && (
                  <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                )}
                <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("auth.enterOtpSentToPhone", { phone })}
                </p>
              </div>
              {error && (
                <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300"
                >
                  {submitting ? t("auth.creatingAccount") : t("auth.signUp")}
                </button>
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

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
              {t("auth.alreadyHaveAccount")}
              <Link
                href="/signin"
                className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                {t("auth.signIn")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

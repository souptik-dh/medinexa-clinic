"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";

type Mode = "owner" | "staff" | "doctor";
type RequiredField =
  | "email"
  | "password"
  | "doctorEmail"
  | "doctorPassword"
  | "staffEmail"
  | "otp";

export default function SignInForm() {
  const [mode, setMode] = useState<Mode>("owner");
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [doctorEmail, setDoctorEmail] = useState("");
  const [doctorPassword, setDoctorPassword] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login, doctorLogin, staffLogin, verifyStaffOtp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("reason") === "session_expired";
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!doctorEmail.trim() || !doctorPassword.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await doctorLogin(doctorEmail, doctorPassword);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitted(true);
    if (!staffEmail.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await staffLogin(staffEmail);
      setMessage("If an account exists for this email, an OTP has been sent.");
      setStage("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request an OTP");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!otp.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await verifyStaffOtp(staffEmail, otp);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify the OTP");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setStage("request");
    setError(null);
    setMessage(null);
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
              Sign In
            </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {mode === "owner"
                  ? "Enter your clinic owner email and password to sign in!"
                  : mode === "doctor"
                    ? "Enter your doctor account email and password to sign in!"
                    : "Sign in as branch staff using a one-time password."}
              </p>
          </div>

          {sessionExpired && (
            <div className="mb-5 rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:bg-warning-500/10 dark:text-warning-400">
              Your session has expired. Please sign in again.
            </div>
          )}

          <div className="mb-6 flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800/50">
            <button
              type="button"
              onClick={() => switchMode("owner")}
              className={tabClass("owner")}
            >
              Clinic owner
            </button>
            <button
              type="button"
              onClick={() => switchMode("staff")}
              className={tabClass("staff")}
            >
              Staff
            </button>
            {/* <button
              type="button"
              onClick={() => switchMode("doctor")}
              className={tabClass("doctor")}
            >
              Doctor
            </button> */}
          </div>

          {mode === "owner" ? (
            <div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input
                    placeholder="owner@example.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => touch("email")}
                    error={showError("email", !email.trim())}
                    hint={showError("email", !email.trim()) ? REQUIRED_FIELD_MESSAGE : undefined}
                    required
                  />
                </div>
                <div>
                  <Label>
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => touch("password")}
                      error={showError("password", !password.trim())}
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
                  {showError("password", !password.trim()) && (
                    <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />
                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                      Keep me logged in
                    </span>
                  </div>
                  <Link
                    href="/reset-password"
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Forgot password?
                  </Link>
                </div>
                {error && (
                  <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                    {error}
                  </div>
                )}
                <div>
                  <Button className="w-full" size="sm" disabled={submitting}>
                    {submitting ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </form>
            </div>
          ) : mode === "doctor" ? (
            <form onSubmit={handleDoctorSubmit} className="space-y-6">
              <div>
                <Label>
                  Email <span className="text-error-500">*</span>{" "}
                </Label>
                <Input
                  placeholder="doctor@example.com"
                  type="email"
                  value={doctorEmail}
                  onChange={(e) => setDoctorEmail(e.target.value)}
                  onBlur={() => touch("doctorEmail")}
                  error={showError("doctorEmail", !doctorEmail.trim())}
                  hint={
                    showError("doctorEmail", !doctorEmail.trim())
                      ? REQUIRED_FIELD_MESSAGE
                      : undefined
                  }
                  required
                />
              </div>
              <div>
                <Label>
                  Password <span className="text-error-500">*</span>{" "}
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={doctorPassword}
                    onChange={(e) => setDoctorPassword(e.target.value)}
                    onBlur={() => touch("doctorPassword")}
                    error={showError("doctorPassword", !doctorPassword.trim())}
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
                {showError("doctorPassword", !doctorPassword.trim()) && (
                  <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                )}
              </div>
              {error && (
                <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <Button className="w-full" size="sm" disabled={submitting}>
                  {submitting ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </form>
          ) : stage === "request" ? (
            <form onSubmit={handleOtpRequest} className="space-y-6">
              <div>
                <Label>
                  Email <span className="text-error-500">*</span>{" "}
                </Label>
                <Input
                  placeholder="staff@clinic.com"
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  onBlur={() => touch("staffEmail")}
                  error={showError("staffEmail", !staffEmail.trim())}
                  hint={
                    showError("staffEmail", !staffEmail.trim())
                      ? REQUIRED_FIELD_MESSAGE
                      : undefined
                  }
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
                  {submitting ? "Sending OTP..." : "Send OTP"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} className="space-y-6">
              <div>
                <Label>OTP <span className="text-error-500">*</span> </Label>
                <Input
                  placeholder="6-digit code"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  onBlur={() => touch("otp")}
                  error={showError("otp", !otp.trim())}
                  required
                />
                {showError("otp", !otp.trim()) ? (
                  <p className="mt-1.5 text-xs text-error-500">{REQUIRED_FIELD_MESSAGE}</p>
                ) : (
                  <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                    Enter the code sent to {staffEmail}.
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
                  {submitting ? "Verifying..." : "Verify & sign in"}
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
                  Back
                </button>
              </div>
            </form>
          )}

          {mode === "owner" && (
            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Don&apos;t have an account? {""}
                <Link
                  href="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign Up
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

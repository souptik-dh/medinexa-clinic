"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { ApiError, authApi } from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";

const REDIRECT_DELAY_MS = 2000;

type RequiredField = "inviteCode" | "password" | "confirmPassword";

export default function AcceptDoctorInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const codeFromLink = searchParams.get("code");
  const reg_no = searchParams.get("reg_no");

  const [inviteCode, setInviteCode] = useState(codeFromLink ?? "");
  const [regNo, setRegNo] = useState(reg_no ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const activationInFlight = useRef(false);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      router.push("/signin");
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [done, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activationInFlight.current || done) return;
    setError(null);
    setSubmitted(true);
    if (!inviteCode.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    activationInFlight.current = true;
    setSubmitting(true);
    try {
      const res = await authApi.acceptDoctorInvite({
        email: email ?? "",
        invite_code: inviteCode,
        password,
        reg_no: regNo.trim() || undefined,
      });
      setRegNo(res.doctor.reg_no ?? "");
      setDone(true);
      toast.success("Account activated successfully.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to accept this invite";
      setError(message);
      toast.error(message);
      activationInFlight.current = false;
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
              Accept your invitation
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Set a password to activate your Jido Healthcare doctor account.
            </p>
          </div>

          {done ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-success-500/30 bg-success-50 px-4 py-6 text-center dark:bg-success-500/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500/15">
                  <svg
                    className="h-6 w-6 text-success-600 dark:text-success-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-success-700 dark:text-success-500">
                    Account activated successfully
                  </p>
                  <p className="mt-1 text-sm text-success-700/80 dark:text-success-500/80">
                    Redirecting you to sign in…
                  </p>
                </div>
              </div>
              {regNo && (
                <div>
                  <Label>Registration number</Label>
                  <Input type="text" value={regNo} disabled />
                </div>
              )}
            </div>
          ) : !email ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                This invite link is missing your email address. Use the link from your invitation
                email, or ask the clinic to resend it.
              </div>
              <Link
                href="/signin"
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} disabled />
              </div>
              <div>
                <Label>
                  Invite code <span className="text-error-500">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="Code from your invitation email"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  onBlur={() => touch("inviteCode")}
                  error={showError("inviteCode", !inviteCode.trim())}
                  hint={
                    showError("inviteCode", !inviteCode.trim())
                      ? REQUIRED_FIELD_MESSAGE
                      : undefined
                  }
                  required
                />
              </div>
              <div>
                <Label>Registration number</Label>
                <Input
                  type="text"
                  placeholder="MC-123456 (optional)"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                />
              </div>
              <div>
                <Label>
                  Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
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
              <div>
                <Label>
                  Confirm password <span className="text-error-500">*</span>
                </Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => touch("confirmPassword")}
                  error={showError("confirmPassword", !confirmPassword.trim())}
                  hint={
                    showError("confirmPassword", !confirmPassword.trim())
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
                  {submitting ? "Activating..." : "Activate account"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

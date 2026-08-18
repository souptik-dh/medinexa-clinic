"use client";
import toast from "react-hot-toast";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import { markAutoBranchPending } from "@/lib/autoCreateBranch";
import { PHONE_VALIDATION_MESSAGE, isValidPhone, sanitizePhoneDigits } from "@/lib/phone";
import { getErrorMessage } from "@/lib/errorMessage";

type RequiredField = "firstName" | "lastName" | "email" | "phone" | "password";

export default function SignUpForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [autoCreateBranch, setAutoCreateBranch] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const { register } = useAuth();
  const router = useRouter();
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    const name = `${firstName} ${lastName}`.trim();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (phone.trim() !== "" && !isValidPhone(phone)) {
      setError(PHONE_VALIDATION_MESSAGE);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await register({
        name,
        email,
        phone: phone || undefined,
        password,
        // The backend requires clinicName as a string — default it client-side
        // to match this field's own "Defaults to your name if left blank" copy.
        clinicName: clinicName || name,
      });
      if (autoCreateBranch && result.clinicId) {
        markAutoBranchPending(result.clinicId);
      }
      toast.success(result.verified ? "Account created successfully." : result.message);
      if (result.verified) {
        router.push("/dashboard");
      } else {
        setPendingMessage(result.message);
      }
    } catch (err) {
      const message = getErrorMessage(err, "Unable to create account");
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
              Sign Up
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create your clinic owner account to get started
            </p>
          </div>
          {pendingMessage ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                {pendingMessage}
              </div>
              <Link
                href="/signin"
                className="block w-full rounded-lg bg-brand-500 px-4 py-3 text-center text-sm font-medium text-white hover:bg-brand-600"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
          <div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <Label>
                    First Name<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="fname"
                    name="fname"
                    placeholder="Enter your first name"
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
                    Last Name<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="lname"
                    name="lname"
                    placeholder="Enter your last name"
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
                <Label>
                  Email<span className="text-error-500">*</span>
                </Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch("email")}
                  error={showError("email", !email.trim())}
                  hint={showError("email", !email.trim()) ? REQUIRED_FIELD_MESSAGE : undefined}
                  required
                />
              </div>
              <div>
                <Label>Clinic name</Label>
                <Input
                  type="text"
                  id="clinicName"
                  name="clinicName"
                  placeholder="Defaults to your name if left blank"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  id="phone"
                  name="phone"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                  onBlur={() => touch("phone")}
                  error={showError("phone", phone.trim() !== "" && !isValidPhone(phone))}
                  hint={
                    showError("phone", phone.trim() !== "" && !isValidPhone(phone))
                      ? PHONE_VALIDATION_MESSAGE
                      : undefined
                  }
                />
              </div>
              <div>
                <Label>
                  Password<span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    placeholder="Min. 8 characters"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => touch("password")}
                    error={showError("password", !password.trim())}
                    required
                    min="8"
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
              <div className="flex items-start gap-3">
                <Checkbox
                  className="w-5 h-5 mt-0.5"
                  checked={autoCreateBranch}
                  onChange={setAutoCreateBranch}
                />
                <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                  Automatically create my first branch as soon as my clinic has a
                  trade license number on file.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  className="w-5 h-5"
                  checked={isChecked}
                  onChange={setIsChecked}
                />
                <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                  By creating an account means you agree to the{" "}
                  <span className="text-gray-800 dark:text-white/90">
                    Terms and Conditions,
                  </span>{" "}
                  and our{" "}
                  <span className="text-gray-800 dark:text-white">
                    Privacy Policy
                  </span>
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
                  disabled={submitting}
                  className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300"
                >
                  {submitting ? "Creating account..." : "Sign Up"}
                </button>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Already have an account?
                <Link
                  href="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign In
                </Link>
              </p>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

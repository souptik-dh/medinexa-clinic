"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { ApiError, authApi } from "@/lib/api";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function run() {
      if (!token) {
        setStatus("error");
        setMessage("This verification link is missing its token.");
        return;
      }
      try {
        const res = await authApi.verifyEmail(token);
        if (!active) return;
        setStatus("success");
        setMessage(res.message);
      } catch (err) {
        if (!active) return;
        setStatus("error");
        setMessage(err instanceof ApiError ? err.message : "Verification failed.");
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Verify your email
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Confirming your clinic owner account.
            </p>
          </div>

          {status === "verifying" && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Verifying your email…</p>
          )}

          {status === "success" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
                {message}
              </div>
              <Link
                href="/signin"
                className="block w-full rounded-lg bg-brand-500 px-4 py-3 text-center text-sm font-medium text-white hover:bg-brand-600"
              >
                Go to sign in
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {message}
              </div>
              <Link
                href="/signin"
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

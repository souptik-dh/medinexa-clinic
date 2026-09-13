"use client";
import React, { useState } from "react";
import toast from "react-hot-toast";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";

export default function SetPasswordCard() {
  const { t } = useTranslation();
  const { setPassword } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }
    setSubmitting(true);
    try {
      const message = await setPassword(newPassword, confirmPassword);
      toast.success(message || t("auth.passwordSetSuccess"));
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.unableToSetPassword");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("auth.setPasswordTitle")}
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("auth.setPasswordDesc")}</p>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <div>
          <Label>{t("auth.newPassword")}</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder={t("auth.passwordPlaceholder")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
        <div>
          <Label>{t("auth.confirmPassword")}</Label>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder={t("auth.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}
        <Button size="sm" disabled={submitting}>
          {submitting ? t("auth.saving") : t("auth.setPasswordButton")}
        </Button>
      </form>
    </div>
  );
}

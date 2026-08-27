"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DoctorProfile, doctorsApi } from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import FieldError from "@/components/form/FieldError";
import { getInputClass, inputClass } from "@/components/form/fieldStyles";
import PhoneNumberField from "@/components/form/input/PhoneNumberField";
import { PHONE_VALIDATION_MESSAGE, isValidPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

type RequiredField = "name" | "phone";

export default function DoctorProfileForm() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [regNo, setRegNo] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p: DoctorProfile = await doctorsApi.me();
      setName(p.name);
      setPhone(p.phone ?? "");
      setRegNo(p.reg_no ?? "");
      setBio(p.bio ?? "");
    } catch (err) {
      setError(getErrorMessage(err, t("doctorProfile.failedToLoadDoctorProfile")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setSubmitted(true);
    if (!name.trim()) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (phone.trim() !== "" && !isValidPhone(phone)) {
      setError(PHONE_VALIDATION_MESSAGE);
      return;
    }
    if (saving) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await doctorsApi.updateMe({
        name,
        phone: phone || null,
        reg_no: regNo || null,
        bio: bio || null,
      });
      setOk(t("doctorProfile.profileUpdated"));
      toast.success(t("doctorProfile.profileUpdatedSuccess"));
    } catch (err) {
      const message = getErrorMessage(err, t("doctorProfile.unableToUpdateProfile"));
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("doctorProfile.doctorProfileTitle")}</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("doctorProfile.updateNameRegPhoneBio")}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
          {ok}
        </div>
      )}

      {loading ? (
        <DetailSkeleton rows={3} />
      ) : (
        <div className="mt-5 space-y-4">
          <Field label={t("doctors.nameRequired")}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => touch("name")}
              className={getInputClass(showError("name", !name.trim()))}
            />
            {showError("name", !name.trim()) && <FieldError message={REQUIRED_FIELD_MESSAGE} />}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("doctors.regNoLabel")}>
              <input
                type="text"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t("patients.phone")}>
              <PhoneNumberField
                value={phone}
                onChange={setPhone}
                onBlur={() => touch("phone")}
                error={showError("phone", phone.trim() !== "" && !isValidPhone(phone))}
              />
            </Field>
          </div>
          <Field label={t("doctorProfile.bio")}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </Field>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={submit}
          disabled={saving || loading}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {saving ? t("auth.saving") : t("settings.saveChanges")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {label}
      </label>
      {children}
    </div>
  );
}

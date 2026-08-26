"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Clinic, ClinicLicenseType, clinicsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canUpdateClinic } from "@/lib/permissions";
import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

interface ClinicLicensesPanelProps {
  clinicId: string;
  clinicName: string;
  onLicenseUpdated?: (type: ClinicLicenseType, url: string) => void;
}

interface LicenseDef {
  type: ClinicLicenseType;
  labelKey: string;
  required: boolean;
  numberField: "trade_license_number" | "drug_license_number" | "clinical_establishment_reg_number";
  urlField: "trade_license_url" | "drug_license_url" | "clinical_establishment_reg_url";
}

const LICENSE_DEFS: LicenseDef[] = [
  {
    type: "trade-license",
    labelKey: "branches.tradeLicense",
    required: true,
    numberField: "trade_license_number",
    urlField: "trade_license_url",
  },
  {
    type: "drug-license",
    labelKey: "licenses.drugLicense",
    required: false,
    numberField: "drug_license_number",
    urlField: "drug_license_url",
  },
  {
    type: "clinical-establishment-registration",
    labelKey: "licenses.clinicalEstablishmentRegistration",
    required: false,
    numberField: "clinical_establishment_reg_number",
    urlField: "clinical_establishment_reg_url",
  },
];

export default function ClinicLicensesPanel({
  clinicId,
  clinicName,
  onLicenseUpdated,
}: ClinicLicensesPanelProps) {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<ClinicLicenseType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRefs = useRef<Record<ClinicLicenseType, HTMLInputElement | null>>({
    "trade-license": null,
    "drug-license": null,
    "clinical-establishment-registration": null,
  });

  const { t } = useTranslation();
  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canUpload = isAdmin || canUpdateClinic(userPermissions);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await clinicsApi.get(clinicId);
      setClinic(c);
    } catch (err) {
      setError(getErrorMessage(err, t("licenses.failedToLoad")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileSelect = async (
    type: ClinicLicenseType,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canUpload) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    setUploadingType(type);
    setError(null);
    setOk(null);
    try {
      const res = await clinicsApi.uploadLicense(clinicId, type, file);
      await load();
      onLicenseUpdated?.(res.type, res.url);
      setOk(t("licenses.documentUploaded"));
      toast.success(t("licenses.uploadSuccess"));
    } catch (err) {
      const message = getErrorMessage(err, t("licenses.uploadFailed"));
      setError(message);
      toast.error(message);
    } finally {
      setUploadingType(null);
      const ref = fileRefs.current[type];
      if (ref) ref.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("licenses.title")}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{clinicName}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
          {ok}
        </div>
      )}

      {loading ? (
        <DetailSkeleton rows={3} />
      ) : (
        <div className="space-y-3">
          {LICENSE_DEFS.map((def) => {
            const number = clinic?.[def.numberField] ?? null;
            const url = clinic?.[def.urlField] ?? null;
            const uploading = uploadingType === def.type;
            return (
              <div
                key={def.type}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-800 dark:text-white/90">
                    {t(def.labelKey)}
                    {def.required && <span className="text-error-500"> *</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    {number || t("licenses.noLicenseNumberSet")}
                  </p>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-sm text-brand-500 hover:underline"
                    >
                      {t("licenses.viewUploadedDocument")}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                      {t("branches.noDocumentUploaded")}
                    </p>
                  )}
                </div>

                {canUpload && (
                  <div className="flex items-center gap-3">
                    <input
                      ref={(el) => {
                        fileRefs.current[def.type] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => handleFileSelect(def.type, e)}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileRefs.current[def.type]?.click()}
                      disabled={uploading}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
                    >
                      {uploading
                        ? t("doctors.uploading")
                        : url
                        ? t("licenses.replaceDocument")
                        : t("licenses.uploadDocument")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

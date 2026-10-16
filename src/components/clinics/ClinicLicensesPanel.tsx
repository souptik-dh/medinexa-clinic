"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Clinic, ClinicLicenseType, clinicsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canUpdateClinic } from "@/lib/permissions";
import { getErrorMessage } from "@/lib/errorMessage";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";
import { useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";
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
  // Each license type uploads independently - one in flight never blocks the others.
  const upload = useKeyedAction<ClinicLicenseType>();
  const { begin, isLatest } = useLatestRequest();
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

  // `silent` refreshes after an upload without flashing the skeleton.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const token = begin();
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const c = await clinicsApi.get(clinicId);
      if (!isLatest(token)) return;
      setClinic(c);
    } catch (err) {
      if (!isLatest(token)) return;
      setError(getErrorMessage(err, t("licenses.failedToLoad")));
    } finally {
      if (isLatest(token)) setLoading(false);
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
    if (upload.isPending(type)) return;
    setError(null);
    setOk(null);
    await upload.run(type, async () => {
      try {
        const res = await clinicsApi.uploadLicense(clinicId, type, file);
        await load({ silent: true });
        onLicenseUpdated?.(res.type, res.url);
        setOk(t("licenses.documentUploaded"));
        toast.success(t("licenses.uploadSuccess"));
      } catch (err) {
        const message = getErrorMessage(err, t("licenses.uploadFailed"));
        setError(message);
        toast.error(message);
      } finally {
        const ref = fileRefs.current[type];
        if (ref) ref.value = "";
      }
    });
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
          {!clinic && !loading && (
            <button
              type="button"
              onClick={() => load()}
              className="ml-3 font-medium underline"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
          {ok}
        </div>
      )}

      {loading ? (
        // One placeholder card per license row, same footprint as the real ones.
        <div className="space-y-3" aria-busy="true">
          {LICENSE_DEFS.map((def) => (
            <div
              key={def.type}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-36" />
              </div>
              {canUpload && <Skeleton className="h-9 w-32 rounded-lg" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {LICENSE_DEFS.map((def) => {
            const number = clinic?.[def.numberField] ?? null;
            const url = clinic?.[def.urlField] ?? null;
            const uploading = upload.isPending(def.type);
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
                      disabled={uploading}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[def.type]?.click()}
                      disabled={uploading}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
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

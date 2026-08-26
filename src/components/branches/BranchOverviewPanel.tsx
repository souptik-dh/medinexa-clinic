"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import BranchOverviewHeader from "@/components/branches/BranchOverviewHeader";
import BranchSchedulePanel from "@/components/branches/BranchSchedulePanel";
import {
  Branch,
  BranchGalleryImage,
  BranchLicenseType,
  branchesApi,
  branchLabTestsApi,
  doctorsApi,
  labTestSchedulesApi,
} from "@/lib/api";

import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import FormDrawer from "@/components/common/FormDrawer";
import BranchForm from "@/components/branches/BranchForm";
import { useTranslation } from "@/hooks/useTranslation";

export default function BranchOverviewPanel() {
  const { t } = useTranslation();
  const params = useParams<{ clinicId?: string; branchId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const branchId = typeof params.branchId === "string" ? params.branchId : "";

  const [branch, setBranch] = useState<Branch | null>(null);
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [labTestCount, setLabTestCount] = useState<number | null>(null);
  const [scheduleCount, setScheduleCount] = useState<number | null>(null);
  const [galleryImages, setGalleryImages] = useState<BranchGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<BranchLicenseType | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const tradeInputRef = useRef<HTMLInputElement>(null);
  const drugInputRef = useRef<HTMLInputElement>(null);
  const clinicalInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!clinicId || !branchId) return;
    setLoading(true);
    setError(null);
    try {
      const [branchesRes, doctorsRes, labTestsRes, scheduleRes, galleryRes] =
        await Promise.all([
          branchesApi.list(clinicId),
          doctorsApi.listByBranch(branchId),
          branchLabTestsApi.list(branchId),
          labTestSchedulesApi.list(branchId),
          branchesApi.listGallery(branchId),
        ]);
      const found = branchesRes.items.find((b) => b.id === branchId) ?? null;
      if (!found) {
        setError(t("branchOverview.branchNotFound"));
        return;
      }
      setBranch(found);
      setDoctorCount(doctorsRes.total);
      setLabTestCount(labTestsRes.items.length);
      setScheduleCount(scheduleRes.items.length);
      setGalleryImages(galleryRes.items ?? []);
    } catch (err) {
      setError(getErrorMessage(err, t("branchOverview.failedToLoadOverview")));
    } finally {
      setLoading(false);
    }
  }, [clinicId, branchId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !branch) return;
    setUploadingPhoto(true);
    try {
      const res = await branchesApi.uploadPhoto(branchId, file);
      setBranch({ ...branch, photo_url: res.photo_url });
      toast.success(t("branchOverview.photoUpdated"));
    } catch (err) {
      toast.error(getErrorMessage(err, t("branchOverview.failedToUploadPhoto")));
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingGallery(true);
    try {
      const img = await branchesApi.uploadGalleryImage(branchId, file);
      setGalleryImages((prev) => [img, ...prev]);
      toast.success(t("branchOverview.imageUploadedToGallery"));
    } catch (err) {
      toast.error(getErrorMessage(err, t("branchOverview.failedToUploadImage")));
    } finally {
      setUploadingGallery(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleDocUpload = async (
    type: BranchLicenseType,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !branch) return;
    setUploadingDoc(type);
    try {
      const res = await branchesApi.uploadLicense(branchId, type, file);
      setBranch({
        ...branch,
        [`${type.replace(/-/g, "_")}_url`]: res.url,
      });
      toast.success(t("branchOverview.documentUploaded"));
    } catch (err) {
      toast.error(getErrorMessage(err, t("branchOverview.failedToUploadDocument")));
    } finally {
      setUploadingDoc(null);
      e.target.value = "";
    }
  };

  if (loading) {
    return <DetailSkeleton rows={5} />;
  }
  if (error || !branch) {
    return (
      <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
        {error ?? t("branchOverview.branchNotFound")}
      </div>
    );
  }

  const addressLine = [
    branch.city,
    branch.district,
    branch.state,
    branch.pin_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <BranchOverviewHeader clinicId={clinicId} branchName={branch.name} />

      {/* Branch Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0V6.375a3 3 0 013-3h12a3 3 0 013 3v3"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {branch.name}
                </h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                  {t("status.active")}
                </span>
              </div>
              {addressLine && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {addressLine}
                </p>
              )}
              <p className="mt-0.5 text-theme-xs text-gray-400 dark:text-gray-500">
                {branch.phone} · {branch.timezone}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-lg border border-brand-500/40 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              {t("common.edit")}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t("doctors.title")}
          value={doctorCount ?? "—"}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
        />
        <StatCard
          label={t("labTests.title")}
          value={labTestCount ?? "—"}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          }
        />
        <StatCard
          label={t("branchOverview.schedules")}
          value={scheduleCount ?? "—"}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
      </div>

      {/* Clinic schedule (operating days + closures) */}
      <BranchSchedulePanel showBackButton={false} />

      {/* Branch Image */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t("branchOverview.branchImage")}
          </h4>
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {uploadingPhoto ? t("doctors.uploading") : t("branchOverview.uploadPhoto")}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>
        {branch.photo_url ? (
          <img
            src={branch.photo_url}
            alt={t("branchOverview.photoAlt", { name: branch.name })}
            className="h-48 w-full rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]">
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("branchOverview.noPhotoUploaded")}</p>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t("branchOverview.documents")}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DocumentCard
            label={t("branches.tradeLicense")}
            number={branch.trade_license_number}
            url={branch.trade_license_url}
            status={branch.trade_license_validation_status}
            uploading={uploadingDoc === "trade-license"}
            onUpload={() => tradeInputRef.current?.click()}
          />
          <DocumentCard
            label={t("branchOverview.drugLicense")}
            number={branch.drug_license_number}
            url={branch.drug_license_url}
            uploading={uploadingDoc === "drug-license"}
            onUpload={() => drugInputRef.current?.click()}
          />
          <DocumentCard
            label={t("branchOverview.clinicalEstablishment")}
            number={branch.clinical_establishment_reg_number}
            url={branch.clinical_establishment_reg_url}
            uploading={uploadingDoc === "clinical-establishment-registration"}
            onUpload={() => clinicalInputRef.current?.click()}
          />
        </div>
        <input ref={tradeInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleDocUpload("trade-license", e)} />
        <input ref={drugInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleDocUpload("drug-license", e)} />
        <input ref={clinicalInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleDocUpload("clinical-establishment-registration", e)} />
      </div>

      {/* Gallery */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t("branchOverview.gallery")}
          </h4>
          <button
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploadingGallery}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {uploadingGallery ? t("doctors.uploading") : t("branchOverview.addImage")}
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleGalleryUpload}
          />
        </div>
        {galleryImages.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]">
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("branchOverview.noImagesUploaded")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {galleryImages.map((img) => (
              <div key={img.id} className="group relative">
                <img
                  src={img.image_url}
                  alt={t("branchOverview.gallery")}
                  className="h-32 w-full rounded-xl object-cover"
                />
                <button
                  onClick={async () => {
                    try {
                      await branchesApi.removeGalleryImage(branchId, img.id);
                      setGalleryImages((prev) =>
                        prev.filter((g) => g.id !== img.id)
                      );
                      toast.success(t("branchOverview.imageRemoved"));
                    } catch {
                      /* silent */
                    }
                  }}
                  className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit branch — drawer keeps the user on the branch overview */}
      <FormDrawer
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={t("branches.editBranch")}
        description={branch?.name}
      >
        <BranchForm
          mode="edit"
          clinicId={clinicId}
          branchId={branchId}
          onDone={() => {
            setEditOpen(false);
            load();
          }}
          onCancel={() => setEditOpen(false)}
        />
      </FormDrawer>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
          {icon}
        </div>
      </div>
      <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
        {value}
      </h4>
    </div>
  );
}

function DocumentCard({
  label,
  number,
  url,
  status,
  uploading,
  onUpload,
}: {
  label: string;
  number?: string | null;
  url?: string | null;
  status?: string;
  uploading?: boolean;
  onUpload?: () => void;
}) {
  const { t } = useTranslation();
  const hasFile = Boolean(url);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/[0.02]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      {number && (
        <p className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          {number}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {hasFile ? (
          <a
            href={url!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            {t("common.view")}
          </a>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t("branchOverview.notUploaded")}
          </span>
        )}
        <button
          onClick={onUpload}
          disabled={uploading}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {uploading ? t("doctors.uploading") : hasFile ? t("branchOverview.replace") : t("branchOverview.upload")}
        </button>
      </div>
      {status && (
        <span
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            status === "validated"
              ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
              : status === "rejected"
              ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
              : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
          }`}
        >
          {status}
        </span>
      )}
    </div>
  );
}

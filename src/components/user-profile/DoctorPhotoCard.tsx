"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { ApiError, DoctorProfile, doctorsApi } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";

export default function DoctorPhotoCard() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Upload and refresh both replace the photo, so each blocks the other.
  const { pending: uploading, run: runUpload } = useAsyncAction();
  const { pending: refreshing, run: runRefresh } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const p = await doctorsApi.me();
      setProfile(p);
      setPhotoUrl(p.photo_url ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("doctorProfile.failedToLoadDoctorProfile"));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runUpload(async () => {
      setError(null);
      setLoadFailed(false);
      setOk(null);
      try {
        const res = await doctorsApi.uploadPhoto(file);
        setPhotoUrl(res.photo_url);
        setOk(t("doctorProfile.photoUploaded"));
        toast.success(t("doctorProfile.photoUploaded"));
      } catch (err) {
        const message = err instanceof ApiError ? err.message : t("doctorProfile.photoUploadFailed");
        setError(message);
        toast.error(message);
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  const refreshUrl = async () => {
    await runRefresh(async () => {
      setError(null);
      setLoadFailed(false);
      setOk(null);
      try {
        const p = await doctorsApi.me();
        setProfile(p);
        setPhotoUrl(p.photo_url ?? null);
        setOk(t("doctorProfile.photoUrlRefreshed"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("doctorProfile.failedToRefreshPhotoUrl"));
      }
    });
  };

  const initials = (profile?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("doctorProfile.doctorPhoto")}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("doctorProfile.photoHintCloudinary")}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
          {loadFailed && (
            <button
              type="button"
              onClick={load}
              className="ml-3 font-medium underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
          {ok}
        </div>
      )}

      {loading ? (
        <div aria-busy="true" className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="sr-only">{t("doctorProfile.loadingProfile")}</span>
          <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={`${profile?.name ?? "Doctor"} photo`}
              width={112}
              height={112}
              unoptimized
              className="h-28 w-28 rounded-full border border-gray-200 object-cover dark:border-gray-800"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-500 text-3xl font-semibold text-white">
              {initials}
            </div>
          )}
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileSelected}
                disabled={uploading || refreshing}
                className="block w-full max-w-xs text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-200"
              />
              {uploading && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t("doctors.uploading")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || refreshing}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {uploading ? t("doctors.uploading") : t("doctorProfile.uploadPhoto")}
              </button>
              {photoUrl && (
                <button
                  type="button"
                  onClick={refreshUrl}
                  disabled={uploading || refreshing}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {refreshing ? t("common.loading") : t("doctorProfile.refreshPreview")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

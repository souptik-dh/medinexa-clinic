"use client";
import React, { useRef, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { branchesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canUpdateBranch } from "@/lib/permissions";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

interface BranchPhotoPanelProps {
  branchId: string;
  branchName: string;
  photoUrl: string | null;
  onPhotoUpdated: (photoUrl: string) => void;
}

export default function BranchPhotoPanel({
  branchId,
  branchName,
  photoUrl,
  onPhotoUpdated,
}: BranchPhotoPanelProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canUpload = isAdmin || canUpdateBranch(userPermissions);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canUpload) {
      toast.error(t("appointments.noPermission"));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const res = await branchesApi.uploadPhoto(branchId, file);
      onPhotoUpdated(res.photo_url);
      toast.success(t("gallery.photoUpdateSuccess"));
    } catch (err) {
      const message = getErrorMessage(err, t("gallery.photoUploadFailed"));
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("gallery.branchPhotoTitle")}</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{branchName}</p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={t("gallery.photoAlt", { branchName })}
            width={112}
            height={112}
            unoptimized
            className="h-28 w-28 rounded-lg border border-gray-200 object-cover dark:border-gray-800"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
            {t("gallery.noPhoto")}
          </div>
        )}

        {canUpload && (
          <div className="flex flex-1 flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileSelect}
              disabled={uploading}
              className="block w-full max-w-xs text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-200"
            />
            {uploading && (
              <span className="text-sm text-gray-500 dark:text-gray-400">{t("doctors.uploading")}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

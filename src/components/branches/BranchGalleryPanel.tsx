"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, BranchGalleryImage, branchesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  canUpdateBranch,
  canDeleteBranch,
} from "@/lib/permissions";

interface BranchGalleryPanelProps {
  branchId: string;
  branchName: string;
}

export default function BranchGalleryPanel({ branchId, branchName }: BranchGalleryPanelProps) {
  const [images, setImages] = useState<BranchGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const canUpload = isAdmin || canUpdateBranch(userPermissions);
  const canDelete = isAdmin || canDeleteBranch(userPermissions);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await branchesApi.listGallery(branchId);
      setImages(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load gallery");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      await branchesApi.uploadGalleryImage(branchId, file);
      await loadGallery();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageId: string) => {
    if (!window.confirm("Delete this image?")) return;
    setDeleting(imageId);
    setError(null);
    try {
      await branchesApi.removeGalleryImage(branchId, imageId);
      await loadGallery();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Gallery</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{branchName}</p>
        </div>
        {canUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {uploading ? "Uploading…" : "+ Add image"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading gallery…
        </div>
      ) : images.length === 0 ? (
        <div className="py-12 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">No images yet</p>
          {canUpload && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Click "Add image" to get started
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <img
                src={img.image_url}
                alt="Gallery"
                className="aspect-square w-full object-cover"
              />
              {canDelete && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => deleteImage(img.id)}
                    disabled={deleting === img.id}
                    className="flex items-center gap-2 rounded-lg bg-error-600 px-3 py-2 text-sm font-medium text-white hover:bg-error-700 disabled:bg-error-400"
                  >
                    {deleting === img.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
                <p className="text-theme-xs text-gray-300">
                  {new Date(img.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import React, { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import DoctorPhotoCard from "@/components/user-profile/DoctorPhotoCard";
import { useAuth } from "@/context/AuthContext";
import { ApiError, Clinic, clinicsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function ProfilePanel() {
  const { user, clinic, logout } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.list({ limit: 50 });
      setClinics(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load clinics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {user?.role === "doctor" && (
        <div className="col-span-12">
          <DoctorPhotoCard />
        </div>
      )}

      {/* Identity card */}
      <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-4">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-3xl font-semibold text-white">
            {initials}
          </div>
          <h3 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">
            {user?.name}
          </h3>
          <Badge color="primary" className="mt-2">
            {user?.role ?? "clinic_owner"}
          </Badge>
        </div>
        <dl className="mt-6 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <ProfileRow label="Email" value={user?.email} />
          <ProfileRow label="Phone" value={user?.phone ?? "—"} />
          <ProfileRow label="Clinics" value={String(clinics.length)} />
        </dl>
        <button
          onClick={logout}
          className="mt-6 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Sign out
        </button>
      </div>

      {/* Clinics */}
      <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-8">
        <div className="mb-5 flex items-center justify-between lg:mb-7">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            My Clinics
          </h3>
          <a
            href="/clinics"
            className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
          >
            Manage →
          </a>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-error-600 dark:text-error-400">{error}</p>
        ) : clinics.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            {clinic
              ? "Your clinic hasn't been set up yet."
              : "No clinics found. Create one from the Clinics page."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {clinics.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-800 dark:text-white/90">{c.name}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                      {c.description ?? "No description"}
                    </p>
                  </div>
                  <Badge color="info">{c.branch_count ?? 0} branches</Badge>
                </div>
                <p className="mt-4 text-theme-xs text-gray-400 dark:text-gray-500">
                  Created {formatDate(c.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

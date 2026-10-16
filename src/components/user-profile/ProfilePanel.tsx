"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import DoctorPhotoCard from "@/components/user-profile/DoctorPhotoCard";
import DoctorProfileForm from "@/components/user-profile/DoctorProfileForm";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  Clinic,
  ProfilePhotoRole,
  authApi,
  clinicsApi,
  profilePhotoApi,
} from "@/lib/api";
import { BRANCH_STAFF_PERMISSION_META } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { CardGridSkeleton, Skeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import toast from "react-hot-toast";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function inputClass() {
  return "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
}

export default function ProfilePanel() {
  const { t } = useTranslation();
  const { user, clinic, staffClinic, staffBranch, logout, updateUser } = useAuth();
  const isBranchStaff = user?.role === "branch_staff";
  const canEditPhoto =
    user?.role === "clinic_owner" || user?.role === "branch_staff";
  const role: ProfilePhotoRole | null =
    user?.role === "clinic_owner"
      ? "clinic_owner"
      : user?.role === "branch_staff"
        ? "branch_staff"
        : null;

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isBranchStaff);

  // ── Edit profile ──
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pending: saving, run: runSave } = useAsyncAction();

  // ── Change phone ──
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const { pending: phoneBusy, run: runPhone } = useAsyncAction();

  // ── Change password ──
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const { pending: pwBusy, run: runPassword } = useAsyncAction();

  // ── Photo ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicsApi.mine();
      setClinics(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("billing.failedToLoadClinics"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isBranchStaff) return;
    load();
  }, [load, isBranchStaff]);

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const openEdit = () => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setSaveError(null);
    setEditing(true);
    setPhoneOpen(false);
    setPwOpen(false);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setSaveError(t("profilePage.fullName"));
      return;
    }
    await runSave(async () => {
      setSaveError(null);
      try {
        const res = await authApi.updateMe({
          name: name.trim(),
          email: email.trim() === "" ? null : email.trim(),
        });
        await updateUser({ name: res.name, email: res.email ?? "" });
        setEditing(false);
        if (res.pending_email) {
          toast.success(
            t("profilePage.emailConfirmLinkSent", { email: res.pending_email })
          );
        } else {
          toast.success(t("profilePage.profileUpdated"));
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t("profilePage.updateFailed");
        setSaveError(msg);
        toast.error(msg);
      }
    });
  };

  const sendPhoneOtp = async () => {
    setPhoneError(null);
    const phone = newPhone.trim();
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""))) {
      setPhoneError(t("profilePage.newPhone"));
      return;
    }
    await runPhone(async () => {
      try {
        await authApi.sendVerifyPhoneOtp({ phone });
        setOtpSent(true);
        toast.success(t("profilePage.otpSentTo", { phone }));
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t("profilePage.changePhoneFailed");
        setPhoneError(msg);
        toast.error(msg);
      }
    });
  };

  const verifyPhone = async () => {
    setPhoneError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setPhoneError(t("profilePage.otpCode"));
      return;
    }
    await runPhone(async () => {
      try {
        await authApi.verifyPhoneChange(newPhone.trim(), otp.trim());
        await updateUser({ phone: newPhone.trim() });
        setPhoneOpen(false);
        setOtpSent(false);
        setNewPhone("");
        setOtp("");
        toast.success(t("profilePage.phoneUpdated"));
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t("profilePage.changePhoneFailed");
        setPhoneError(msg);
        toast.error(msg);
      }
    });
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError(t("profilePage.passwordMinLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("profilePage.passwordMismatch"));
      return;
    }
    await runPassword(async () => {
      try {
        await authApi.setPassword(newPassword, confirmPassword);
        setPwOpen(false);
        setNewPassword("");
        setConfirmPassword("");
        toast.success(t("profilePage.passwordUpdated"));
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t("profilePage.passwordChangeFailed");
        setPwError(msg);
        toast.error(msg);
      }
    });
  };

  const onPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !role) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(t("profilePage.photoFailed"));
      return;
    }
    setPhotoBusy(true);
    try {
      const res = await profilePhotoApi.upload(role, file);
      await updateUser({ photo_url: res.photo_url });
      toast.success(t("profilePage.photoUpdated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("profilePage.photoFailed"));
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {user?.role === "doctor" && (
        <div className="col-span-12 space-y-4 md:space-y-6">
          <DoctorProfileForm />
          <DoctorPhotoCard />
        </div>
      )}

      {/* Identity card */}
      <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-4">
        <div className="flex flex-col items-center text-center">
          {user?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photo_url}
              alt={user?.name ?? ""}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-3xl font-semibold text-white">
              {initials}
            </div>
          )}
          {canEditPhoto && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onPhotoSelected}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="mt-2 text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50 dark:text-brand-400"
              >
                {photoBusy ? t("common.loading") : t("profilePage.changePhoto")}
              </button>
            </>
          )}
          <h3 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">
            {user?.name}
          </h3>
          <Badge color="primary" className="mt-2">
            {user?.role ?? "clinic_owner"}
          </Badge>
        </div>
        <dl className="mt-6 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <ProfileRow label={t("auth.email")} value={user?.email} />
          <ProfileRow label={t("patients.phone")} value={user?.phone ?? "—"} />
          {isBranchStaff ? (
            <>
              <ProfileRow label={t("dashboard.clinic")} value={staffClinic?.name ?? "—"} />
              <ProfileRow label={t("appointments.branch")} value={staffBranch?.name ?? "—"} />
            </>
          ) : (
            <ProfileRow
              label={t("dashboard.clinics")}
              value={loading ? <Skeleton className="h-4 w-6" /> : String(clinics.length)}
            />
          )}
        </dl>
        {user?.role !== "doctor" && (
          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={openEdit}
              className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              {t("profilePage.editProfile")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhoneOpen((v) => !v);
                setPwOpen(false);
                setEditing(false);
                setPhoneError(null);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("profilePage.changePhone")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPwOpen((v) => !v);
                setPhoneOpen(false);
                setEditing(false);
                setPwError(null);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("profilePage.changePassword")}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("auth.signOut")}
        </button>
      </div>

      {/* Edit / phone / password cards */}
      <div className="col-span-12 space-y-4 xl:col-span-8">
        {editing && (
          <form
            onSubmit={saveProfile}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6"
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("profilePage.editProfile")}
            </h3>
            {saveError && (
              <div className="mb-3 rounded-lg border border-error-500/30 bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {saveError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("profilePage.fullName")}
                </label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("profilePage.emailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass()}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? t("settings.saving") : t("common.save")}
              </button>
            </div>
          </form>
        )}

        {phoneOpen && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("profilePage.changePhone")}
            </h3>
            {phoneError && (
              <div className="mb-3 rounded-lg border border-error-500/30 bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {phoneError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("profilePage.newPhone")}
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  disabled={otpSent}
                  className={inputClass()}
                />
              </div>
              {otpSent && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {t("profilePage.otpCode")}
                  </label>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    className={inputClass()}
                  />
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPhoneOpen(false);
                  setOtpSent(false);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {t("common.cancel")}
              </button>
              {otpSent ? (
                <button
                  type="button"
                  onClick={verifyPhone}
                  disabled={phoneBusy}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {phoneBusy ? t("common.loading") : t("profilePage.verifyOtp")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sendPhoneOtp}
                  disabled={phoneBusy}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {phoneBusy ? t("common.loading") : t("profilePage.sendOtp")}
                </button>
              )}
            </div>
          </div>
        )}

        {pwOpen && (
          <form
            onSubmit={savePassword}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6"
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              {t("profilePage.changePassword")}
            </h3>
            {pwError && (
              <div className="mb-3 rounded-lg border border-error-500/30 bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {pwError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("profilePage.newPassword")}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass()}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("profilePage.confirmNewPassword")}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass()}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPwOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={pwBusy}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {pwBusy ? t("settings.saving") : t("common.save")}
              </button>
            </div>
          </form>
        )}

        {/* Clinic membership / clinics */}
        {isBranchStaff ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {t("profilePage.permissionsGranted")}
              </h3>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(user?.permissions ?? []).length === 0 ? (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t("profilePage.noPermissionsGranted")}
                </span>
              ) : (
                BRANCH_STAFF_PERMISSION_META.filter((m) =>
                  (user?.permissions ?? []).includes(m.permission)
                ).map((m) => (
                  <span
                    key={m.permission}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
                  >
                    {m.label}
                  </span>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {t("profilePage.myClinics")}
              </h3>
              <a
                href="/clinics"
                className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                {t("profilePage.manage")}
              </a>
            </div>
            {loading ? (
              <CardGridSkeleton count={2} />
            ) : error ? (
              <div className="py-8 text-center text-sm text-error-600 dark:text-error-400">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-2 font-medium underline hover:no-underline"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : clinics.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                {clinic ? t("profilePage.clinicNotSetUp") : t("profilePage.noClinicsFound")}
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
                          {c.description ?? t("branchesListPage.noDescription")}
                        </p>
                      </div>
                      <Badge color="info">
                        {t("branchesListPage.branchesCountBadge", { count: c.branch_count ?? 0 })}
                      </Badge>
                    </div>
                    <p className="mt-4 text-theme-xs text-gray-400 dark:text-gray-500">
                      {t("branchesListPage.createdOn", { date: formatDate(c.created_at) })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

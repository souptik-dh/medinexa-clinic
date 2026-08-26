"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import { Skeleton, DetailSkeleton, ListSkeleton } from "@/components/ui/skeleton/Skeleton";
import RatingStars from "@/components/common/RatingStars";
import { useAuth } from "@/context/AuthContext";
import {
  Appointment,
  AppointmentStatus,
  ApiError,
  AvailabilityResponse,
  BranchDoctor,
  BranchReview,
  DoctorInvite,
  RatingSummary,
  appointmentsApi,
  doctorInvitesApi,
  doctorsApi,
  reviewsApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  formatCurrency,
  inviteStatusColor,
  inviteStatusLabel,
  today,
} from "@/lib/utils";

const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
  "no_show",
];

const formatNextSlot = (iso: string | null): string => {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
};

const initials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function DoctorProfilePanel() {
  const params = useParams<{ branchId?: string; doctorId?: string }>();
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const doctorId = typeof params.doctorId === "string" ? params.doctorId : "";

  const { user, can } = useAuth();
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canManage = isAdmin || can("doctors:manage");
  const canViewReviews = isAdmin || can("reviews:view");

  const [doctor, setDoctor] = useState<BranchDoctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(today());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Appointment[] | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const [invites, setInvites] = useState<DoctorInvite[] | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [rating, setRating] = useState<RatingSummary | null>(null);
  const [reviews, setReviews] = useState<BranchReview[] | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId || !doctorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await doctorsApi.listByBranch(branchId);
      const found = res.items.find((d) => d.id === doctorId) ?? null;
      if (!found) {
        setError("Doctor not found at this branch.");
      }
      setDoctor(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load doctor");
    } finally {
      setLoading(false);
    }
  }, [branchId, doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  const checkAvailability = useCallback(async () => {
    if (!date) return;
    setAvailLoading(true);
    setAvailError(null);
    try {
      const res = await doctorsApi.availability(doctorId, date, branchId);
      setAvailability(res);
    } catch (err) {
      setAvailability(null);
      setAvailError(err instanceof ApiError ? err.message : "Failed to load availability");
    } finally {
      setAvailLoading(false);
    }
  }, [doctorId, date, branchId]);

  useEffect(() => {
    if (doctor && doctor.slot_type !== "sequential") checkAvailability();
  }, [doctor, checkAvailability]);

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const all: Appointment[] = [];
      let cursor: string | undefined;
      do {
        const page = await appointmentsApi.list({ cursor, limit: 100 });
        all.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      setBookings(all.filter((a) => a.doctor_id === doctorId && a.branch_id === branchId));
    } catch (err) {
      setBookingsError(err instanceof ApiError ? err.message : "Failed to load bookings");
    } finally {
      setBookingsLoading(false);
    }
  }, [doctorId, branchId]);

  const loadInvites = useCallback(async () => {
    if (!branchId || !doctor) return;
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const res = await doctorInvitesApi.list(branchId);
      const normalizedName = doctor.name.trim().toLowerCase();
      setInvites(res.items.filter((inv) => inv.name?.trim().toLowerCase() === normalizedName));
    } catch (err) {
      setInvitesError(err instanceof ApiError ? err.message : "Failed to load invites");
    } finally {
      setInvitesLoading(false);
    }
  }, [branchId, doctor]);

  const loadReviews = useCallback(async () => {
    if (!branchId || !doctorId || !canViewReviews) return;
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const res = await reviewsApi.forBranch(branchId, { doctorId, limit: 20 });
      setRating(res.rating);
      setReviews(res.items);
    } catch (err) {
      setReviewsError(err instanceof ApiError ? err.message : "Failed to load reviews");
    } finally {
      setReviewsLoading(false);
    }
  }, [branchId, doctorId, canViewReviews]);

  useEffect(() => {
    if (!doctor) return;
    loadBookings();
    loadInvites();
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor]);

  const bookingCounts = bookings
    ? APPOINTMENT_STATUSES.reduce(
        (acc, status) => {
          acc[status] = bookings.filter((a) => a.status === status).length;
          return acc;
        },
        {} as Record<AppointmentStatus, number>
      )
    : null;

  const uploadPhoto = async (file: File) => {
    if (!doctor) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const res = await doctorsApi.uploadBranchDoctorPhoto(branchId, doctor.id, file);
      setDoctor((prev) => (prev ? { ...prev, photo_url: res.photo_url } : prev));
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Photo upload failed");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <DetailSkeleton rows={4} />
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error ?? "Doctor not found."}
        </div>
        <Link
          href="/doctors"
          className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          ← Back to doctors
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* Identity card */}
      <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-4">
        <div className="flex flex-col items-center text-center">
          {doctor.photo_url ? (
            <Image
              src={doctor.photo_url}
              alt={`${doctor.name} photo`}
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 rounded-full border border-gray-200 object-cover dark:border-gray-800"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-3xl font-semibold text-white">
              {initials(doctor.name)}
            </div>
          )}
          <h3 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">
            {doctor.name}
          </h3>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Badge color="primary">{doctor.specialization ?? "Doctor"}</Badge>
            <Badge color={doctor.slot_type === "sequential" ? "info" : "light"}>
              {doctor.slot_type === "sequential" ? "Sequential booking" : "Fixed booking"}
            </Badge>
          </div>
          {canViewReviews && (
            <div className="mt-3">
              <RatingStars average={(rating ?? doctor.rating)?.average ?? null} count={(rating ?? doctor.rating)?.count ?? 0} />
            </div>
          )}
        </div>
        <dl className="mt-6 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <ProfileRow label="Phone" value={doctor.phone ?? "—"} />
          <ProfileRow label="Fee" value={formatCurrency(doctor.fee_amount, doctor.currency)} />
          <ProfileRow
            label="Certificate"
            value={
              doctor.certificate_url ? (
                <a
                  href={doctor.certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-500 hover:underline"
                >
                  View
                </a>
              ) : (
                "—"
              )
            }
          />
        </dl>
        <Link
          href="/doctors"
          className="mt-6 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          ← Back to doctors
        </Link>
      </div>

      {/* Invites & bookings totals */}
      <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-8">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Invites &amp; bookings
        </h3>

        <div className="mt-5">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Bookings at this branch
          </h4>
          {bookingsLoading ? (
            <Skeleton className="mt-3 h-8 w-64" />
          ) : bookingsError ? (
            <p className="mt-2 text-sm text-error-600 dark:text-error-400">{bookingsError}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300">
                Total: {bookings?.length ?? 0}
              </span>
              {bookingCounts &&
                APPOINTMENT_STATUSES.filter((s) => bookingCounts[s] > 0).map((s) => (
                  <Badge key={s} size="sm" color={appointmentStatusColor(s)}>
                    {appointmentStatusLabel(s)}: {bookingCounts[s]}
                  </Badge>
                ))}
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Invite record
          </h4>
          {invitesLoading ? (
            <Skeleton className="mt-3 h-8 w-48" />
          ) : invitesError ? (
            <p className="mt-2 text-sm text-error-600 dark:text-error-400">{invitesError}</p>
          ) : invites && invites.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <Badge size="sm" color={inviteStatusColor(inv.status)}>
                    {inviteStatusLabel(inv.status)}
                  </Badge>
                  {inv.created_at && (
                    <span className="text-gray-500 dark:text-gray-400">
                      sent {inv.created_at.slice(0, 10)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No matching invite found for this branch (matched by name — may be inexact).
            </p>
          )}
        </div>
      </div>

      {/* Patient reviews */}
      {canViewReviews && (
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Patient reviews
            </h3>
            {rating && <RatingStars average={rating.average} count={rating.count} />}
          </div>
          {reviewsLoading ? (
            <ListSkeleton rows={3} />
          ) : reviewsError ? (
            <p className="mt-4 text-sm text-error-600 dark:text-error-400">{reviewsError}</p>
          ) : !reviews || reviews.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              No reviews yet for this doctor at this branch.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {r.patient_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <RatingStars average={r.rating} count={1} size="sm" hideCount />
                      <span className="text-theme-xs text-gray-400 dark:text-gray-500">
                        {r.created_at.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                  {r.comment && (
                    <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{r.comment}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Photo upload */}
      {canManage && (
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-8">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Doctor photo
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Shown to patients when they book a slot with this doctor.
          </p>

          {photoError && (
            <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {photoError}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadPhoto(file);
              }}
              disabled={photoBusy}
              className="block w-full max-w-xs text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-200"
            />
            {photoBusy && (
              <span className="text-sm text-gray-500 dark:text-gray-400">Uploading…</span>
            )}
          </div>

          <div className="mt-8 border-t border-gray-100 pt-6 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Availability
            </h4>

            {doctor.slot_type === "sequential" ? (
              <div className="mt-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This doctor books as per bookings — patients don&apos;t pick a time slot.
                  Each new appointment is automatically assigned the next open slot within
                  the configured range.
                </p>
                <p className="mt-3 text-sm font-medium text-gray-800 dark:text-white/90">
                  Next available slot: {formatNextSlot(doctor.next_available_slot)}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    />
                  </div>
                  <button
                    onClick={checkAvailability}
                    disabled={availLoading || !date}
                    className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
                  >
                    {availLoading ? "Checking…" : "Check"}
                  </button>
                </div>

                {availError && (
                  <p className="mt-3 text-sm text-error-600 dark:text-error-400">{availError}</p>
                )}

                {availability && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {availability.status === "leave" ? (
                      <p className="text-sm text-error-600 dark:text-error-400">
                        Doctor is on leave for this date
                        {availability.leave?.reason ? ` — ${availability.leave.reason}` : ""}.
                      </p>
                    ) : availability.slots.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No slots configured for this date.
                      </p>
                    ) : (
                      availability.slots.map((slot) => (
                        <span
                          key={slot.time}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                            slot.available
                              ? "border-success-500/30 bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500"
                              : "border-gray-200 bg-gray-50 text-gray-400 line-through dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-500"
                          }`}
                        >
                          {slot.time}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

"use client";
import React, { useCallback, useEffect, useState } from "react";
import { ApiError, BranchReview, RatingSummary, reviewsApi } from "@/lib/api";
import { ListSkeleton } from "@/components/ui/skeleton/Skeleton";
import RatingStars from "@/components/common/RatingStars";

interface BranchReviewsPanelProps {
  branchId: string;
}

export default function BranchReviewsPanel({ branchId }: BranchReviewsPanelProps) {
  const [rating, setRating] = useState<RatingSummary | null>(null);
  const [reviews, setReviews] = useState<BranchReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reviewsApi.forBranch(branchId, { limit: 20 });
      setRating(res.rating);
      setReviews(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reviews");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Patient reviews
        </h3>
        {rating && <RatingStars average={rating.average} count={rating.count} />}
      </div>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <p className="mt-4 text-sm text-error-600 dark:text-error-400">{error}</p>
      ) : reviews.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No reviews yet for doctors at this branch.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {r.patient_name}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500"> · {r.doctor_name}</span>
                </div>
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
  );
}

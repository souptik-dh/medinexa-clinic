import React from "react";

/** Base shimmering block - compose with a className to size/shape it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700/40 ${className}`}
    />
  );
}

/** Matches the app's `<Table>` rows: an avatar-ish first column, text elsewhere. */
export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="w-full">
      <div className="mb-3 flex gap-4 border-b border-gray-100 pb-3 dark:border-gray-800">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-gray-100 py-3.5 last:border-0 dark:border-gray-800"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={c === 0 ? "h-9 w-9 shrink-0 rounded-full" : "h-3.5 flex-1"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Matches a card grid (e.g. clinic/branch cards). */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]"
        />
      ))}
    </div>
  );
}

/** Stacked label+field rows, for forms and detail/profile panels. */
export function DetailSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Simple avatar+text rows, for notification/list-style content. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 dark:border-gray-800"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A few stat/metric boxes, for dashboard-style summary rows. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[140px] animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"
        />
      ))}
    </div>
  );
}

import React from "react";

// One shared tone for every loading placeholder in the portal: a slightly
// dark gray that stays clearly visible on both the gray-50 page background
// and white cards, with a gentle pulse (no shimmer sweep).
const TONE = "bg-gray-300 dark:bg-gray-700";

/** Base pulsing block - compose with a className to size/shape it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md ${TONE} ${className}`}
    />
  );
}

/** Wraps a loading region so assistive tech announces it as busy. */
function LoadingRegion({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}

// Varied widths so placeholder rows read like real text, not a grid of bars.
const CELL_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-3/5", "w-1/3"];

/**
 * Standalone table placeholder (draws its own header bar). Prefer
 * `TableRowsSkeleton` inside the real `<TableBody>` when the table header is
 * already rendered, so the header stays put while rows load.
 */
export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <LoadingRegion className="w-full">
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
    </LoadingRegion>
  );
}

/**
 * Placeholder `<tr>` rows rendered inside an existing `<TableBody>`, matching
 * the real column count so the header, column widths and pagination stay
 * stable while data loads.
 */
export function TableRowsSkeleton({
  rows = 5,
  cols,
  avatar = false,
  actions = false,
  cellClassName = "py-3.5",
}: {
  rows?: number;
  cols: number;
  /** Draw an avatar circle + two text lines in the first column. */
  avatar?: boolean;
  /** Draw right-aligned button placeholders in the last column. */
  actions?: boolean;
  cellClassName?: string;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => {
            const isFirst = c === 0;
            const isLast = c === cols - 1;
            return (
              <td key={c} className={`${cellClassName} pr-4`}>
                {isFirst && avatar ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ) : isLast && actions ? (
                  <div className="flex justify-end gap-1.5">
                    <Skeleton className="h-7 w-14 rounded-lg" />
                    <Skeleton className="h-7 w-14 rounded-lg" />
                  </div>
                ) : (
                  <Skeleton
                    className={`h-3.5 ${CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]} min-w-12`}
                  />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/** Matches a card grid (e.g. clinic/branch cards). */
export function CardGridSkeleton({
  count = 6,
  className = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Stacked label+field rows, for forms and detail/profile panels. */
export function DetailSkeleton({
  rows = 4,
  className = "space-y-5",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Label/value pairs in a responsive grid - for read-only detail pages. */
export function KeyValueSkeleton({
  rows = 6,
  className = "grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className={`h-4 ${CELL_WIDTHS[i % CELL_WIDTHS.length]}`} />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Simple avatar+text rows, for notification/list-style content. */
export function ListSkeleton({
  rows = 4,
  className = "space-y-2",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
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
    </LoadingRegion>
  );
}

/** A few stat/metric boxes, for dashboard-style summary rows. */
export function StatGridSkeleton({
  count = 4,
  className = "grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </LoadingRegion>
  );
}

/** A single metric card: icon tile, label and a large value. */
export function StatCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 ${className}`}
    >
      <Skeleton className="h-12 w-12 rounded-xl" />
      <div className="mt-5 space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-16" />
      </div>
    </div>
  );
}

/** Same footprint as an `h-11` select/input - for API-loaded dropdowns. */
export function SelectSkeleton({ className = "" }: { className?: string }) {
  return <Skeleton className={`h-11 w-full rounded-lg ${className}`} />;
}

/**
 * App chrome placeholder (sidebar + header + content) shown while the stored
 * session is being read on first paint, so protected pages never flash blank.
 */
export function AppShellSkeleton() {
  return (
    <LoadingRegion className="min-h-screen xl:flex">
      <aside className="fixed left-0 top-0 hidden h-screen w-[290px] flex-col gap-3 border-r border-gray-200 bg-white px-5 py-8 dark:border-gray-800 dark:bg-gray-900 lg:flex">
        <Skeleton className="mb-6 h-8 w-36" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className={`h-3.5 ${CELL_WIDTHS[i % CELL_WIDTHS.length]}`} />
          </div>
        ))}
      </aside>
      <div className="flex-1 lg:ml-[290px]">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 md:px-6 lg:h-[76px]">
          <Skeleton className="h-10 w-64 max-w-[50%] rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </header>
        <div className="mx-auto max-w-(--breakpoint-2xl) space-y-4 p-4 md:p-6">
          <Skeleton className="h-6 w-48" />
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${CELL_WIDTHS[i % CELL_WIDTHS.length]}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

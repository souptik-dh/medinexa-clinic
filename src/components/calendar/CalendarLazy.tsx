"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";

// FullCalendar (+ its day/time-grid/interaction plugins) is a large client-only
// bundle used on no other route - load it lazily so the page shell paints
// immediately instead of waiting on that bundle first. `ssr: false` requires
// this indirection to live in a Client Component.
const Calendar = dynamic(() => import("@/components/calendar/Calendar"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  ),
});

export default Calendar;

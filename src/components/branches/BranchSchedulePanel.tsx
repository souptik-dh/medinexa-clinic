"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DetailSkeleton, ListSkeleton } from "@/components/ui/skeleton/Skeleton";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import {
  BranchClosure,
  BranchOperatingDay,
  branchScheduleApi,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canAccessBranchSettings } from "@/lib/permissions";
import DatePicker from "@/components/form/date-picker";
import { formatDate, today } from "@/lib/utils";
import { inputClass, SlotTypeOption } from "@/components/doctors/scheduleShared";
import { getErrorMessage } from "@/lib/errorMessage";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BranchSchedulePanel({
  showBackButton = true,
}: { showBackButton?: boolean } = {}) {
  const router = useRouter();
  const params = useParams<{ branchId?: string }>();
  const branchId = typeof params.branchId === "string" ? params.branchId : "";

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canEdit = isAdmin || canAccessBranchSettings(userPermissions);

  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayBusy, setDayBusy] = useState(false);

  const [closures, setClosures] = useState<BranchClosure[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [closuresError, setClosuresError] = useState<string | null>(null);
  const [closureMode, setClosureMode] = useState<"single" | "range">("single");
  const [singleDate, setSingleDate] = useState(today());
  const [rangeFrom, setRangeFrom] = useState(today());
  const [rangeTo, setRangeTo] = useState(today());
  const [reason, setReason] = useState("");
  const [closureBusy, setClosureBusy] = useState(false);

  const loadSchedule = useCallback(async () => {
    if (!branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await branchScheduleApi.get(branchId);
      setOperatingDays(res.operating_days);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load branch schedule"));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const loadClosures = useCallback(async () => {
    if (!branchId) return;
    setClosuresLoading(true);
    setClosuresError(null);
    try {
      const res = await branchScheduleApi.listClosures(branchId);
      setClosures(res.items);
    } catch (err) {
      setClosures([]);
      setClosuresError(getErrorMessage(err, "Failed to load closures"));
    } finally {
      setClosuresLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadSchedule();
    loadClosures();
  }, [loadSchedule, loadClosures]);

  const toggleDay = async (weekday: number) => {
    if (!canEdit || dayBusy) return;
    const current = operatingDays.find((d) => d.weekday === weekday)?.is_open ?? true;
    setDayBusy(true);
    setError(null);
    try {
      const res = await branchScheduleApi.updateOperatingDays(branchId, [
        { weekday, is_open: !current },
      ]);
      setOperatingDays(res.operating_days);
      toast.success("Schedule updated successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not update that day");
      setError(message);
      toast.error(message);
    } finally {
      setDayBusy(false);
    }
  };

  const addClosure = async () => {
    if (!branchId || !canEdit) return;
    if (closureMode === "single" && !singleDate) return;
    if (closureMode === "range" && (!rangeFrom || !rangeTo || rangeTo < rangeFrom)) return;
    setClosureBusy(true);
    setClosuresError(null);
    try {
      await branchScheduleApi.createClosure(branchId, {
        start_date: closureMode === "range" ? rangeFrom : singleDate,
        end_date: closureMode === "range" ? rangeTo : undefined,
        reason: reason.trim() || null,
      });
      setReason("");
      await loadClosures();
      toast.success("Closure added successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not add closure");
      setClosuresError(message);
      toast.error(message);
    } finally {
      setClosureBusy(false);
    }
  };

  const removeClosure = async (closure: BranchClosure) => {
    if (!canEdit) return;
    setClosureBusy(true);
    setClosuresError(null);
    try {
      await branchScheduleApi.removeClosure(branchId, closure.id);
      await loadClosures();
      toast.success("Closure removed successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not remove closure");
      setClosuresError(message);
      toast.error(message);
    } finally {
      setClosureBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <DetailSkeleton rows={3} />
      </div>
    );
  }

  const activeClosures = closures.filter((c) => c.status !== "cancelled");

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Clinic schedule</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        This sits above every doctor&apos;s own schedule — a day the branch is closed, or a
        branch-wide closure, blocks booking for every doctor here regardless of their own
        weekly pattern or leaves.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Operating days
        </label>
        <div className="flex gap-2">
          {DAY_SHORT.map((name, weekday) => {
            const isOpen = operatingDays.find((d) => d.weekday === weekday)?.is_open ?? true;
            return (
              <button
                key={weekday}
                onClick={() => toggleDay(weekday)}
                disabled={!canEdit || dayBusy}
                className={`flex-1 rounded-lg border px-2 py-2.5 text-center text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isOpen
                    ? "border-brand-500/40 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                    : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-500"
                }`}
              >
                {name}
                <div className="mt-1 text-[10px] font-normal">{isOpen ? "Open" : "Closed"}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Branch closures
        </label>
        <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
          Mark a date or date range unavailable for every doctor at this branch (holidays,
          maintenance, etc).
        </p>

        {closuresError && (
          <div className="mb-3 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {closuresError}
          </div>
        )}

        {closuresLoading ? (
          <ListSkeleton rows={3} />
        ) : activeClosures.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No closures added.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {activeClosures.map((closure) => (
              <li
                key={closure.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {closure.end_date !== closure.start_date
                      ? `${formatDate(closure.start_date)} – ${formatDate(closure.end_date)}`
                      : formatDate(closure.start_date)}
                  </p>
                  {closure.reason && (
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">{closure.reason}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => removeClosure(closure)}
                    disabled={closureBusy}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-40 dark:hover:bg-error-500/10"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <>
            <div className="mb-3 flex gap-3">
              <SlotTypeOption
                label="Single date"
                description="Close one date."
                selected={closureMode === "single"}
                onClick={() => setClosureMode("single")}
              />
              <SlotTypeOption
                label="Date range"
                description="Close every date in a range."
                selected={closureMode === "range"}
                onClick={() => setClosureMode("range")}
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {closureMode === "single" ? (
                <div>
                  <DatePicker
                    id="closure-date"
                    label="Date"
                    placeholder="Select a date"
                    defaultDate={singleDate || undefined}
                    onChange={(_, dateStr) => {
                      if (dateStr) setSingleDate(dateStr);
                    }}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <DatePicker
                      id="closure-range-from"
                      label="From"
                      placeholder="Select a date"
                      defaultDate={rangeFrom || undefined}
                      onChange={(_, dateStr) => {
                        if (dateStr) {
                          setRangeFrom(dateStr);
                          if (rangeTo < dateStr) setRangeTo(dateStr);
                        }
                      }}
                    />
                  </div>
                  <div>
                    <DatePicker
                      id="closure-range-to"
                      label="To"
                      placeholder="Select a date"
                      defaultDate={rangeTo || undefined}
                      onChange={(_, dateStr) => {
                        if (dateStr) setRangeTo(dateStr);
                      }}
                    />
                  </div>
                </>
              )}
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Public holiday"
                  className={inputClass}
                />
              </div>
              <button
                onClick={addClosure}
                disabled={closureBusy}
                className="h-11 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {closureBusy ? "Adding…" : "Add"}
              </button>
            </div>
          </>
        )}
      </div>

      {showBackButton && (
        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={() => router.push("/branches")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Back to branches
          </button>
        </div>
      )}
    </div>
  );
}

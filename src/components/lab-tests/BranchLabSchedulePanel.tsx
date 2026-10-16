"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { LabTestSchedule, labTestSchedulesApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import LabScheduleWeekEditor, {
  LabScheduleEntry,
} from "@/components/lab-tests/LabScheduleWeekEditor";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction } from "@/hooks/useAsyncAction";

function toEntry(item: LabTestSchedule): LabScheduleEntry {
  return {
    localKey: item.id,
    id: item.id,
    weekday: item.weekday,
    start_time: item.start_time,
    end_time: item.end_time,
    is_active: item.is_active,
  };
}

function hasChanged(a: LabScheduleEntry, b: LabScheduleEntry): boolean {
  return (
    a.weekday !== b.weekday ||
    a.start_time !== b.start_time ||
    a.end_time !== b.end_time ||
    a.is_active !== b.is_active
  );
}

// Collapses entries that share the same day and time range down to one, so a
// day only ever displays a single row per distinct range — even if the
// backend already holds duplicate records for it.
function dedupeEntries(list: LabScheduleEntry[]): LabScheduleEntry[] {
  const seen = new Map<string, LabScheduleEntry>();
  for (const entry of list) {
    const key = `${entry.weekday}|${entry.start_time}|${entry.end_time}`;
    const existing = seen.get(key);
    if (!existing || (!existing.id && entry.id)) {
      seen.set(key, entry);
    }
  }
  return Array.from(seen.values());
}

export default function BranchLabSchedulePanel({
  branchId: branchIdProp,
}: { branchId?: string } = {}) {
  const { t } = useTranslation();
  const params = useParams<{ branchId?: string }>();
  const branchId =
    branchIdProp ?? (typeof params.branchId === "string" ? params.branchId : "");

  const [original, setOriginal] = useState<LabScheduleEntry[]>([]);
  const [entries, setEntries] = useState<LabScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const { pending: saving, run: runSave } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  // `silent` refreshes after a save without flashing the editor skeleton.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!branchId) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const res = await labTestSchedulesApi.list(branchId);
      const loaded = res.items.map(toEntry);
      setOriginal(loaded);
      setEntries(dedupeEntries(loaded));
    } catch (err) {
      setError(getErrorMessage(err, t("labSchedule.failedToLoadSchedule")));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    entries.length !== original.length ||
    entries.some((e) => {
      const match = original.find((o) => o.localKey === e.localKey);
      return !match || hasChanged(e, match);
    });

  const handleSave = async () => {
    if (!branchId) return;
    // Locked: a repeated click while saving can't fire the diff twice.
    await runSave(async () => {
      setError(null);
      try {
        const removed = original.filter(
          (o) => !entries.some((e) => e.localKey === o.localKey)
        );
        const added = entries.filter((e) => !e.id);
        const changed = entries.filter((e) => {
          if (!e.id) return false;
          const match = original.find((o) => o.localKey === e.localKey);
          return match && hasChanged(e, match);
        });

        await Promise.all([
          ...removed.map((o) => labTestSchedulesApi.remove(branchId, o.id!)),
          ...added.map((e) =>
            labTestSchedulesApi.create(branchId, {
              weekday: e.weekday,
              start_time: e.start_time,
              end_time: e.end_time,
              is_active: e.is_active,
            })
          ),
          ...changed.map((e) =>
            labTestSchedulesApi.update(branchId, e.id!, {
              weekday: e.weekday,
              start_time: e.start_time,
              end_time: e.end_time,
              is_active: e.is_active,
            })
          ),
        ]);

        toast.success(t("labSchedule.updatedSuccess"));
        // Re-sync ids of newly created ranges - silently, editor stays on screen.
        await load({ silent: true });
      } catch (err) {
        // Unsaved edits are kept so the user can retry.
        const msg = getErrorMessage(
          err,
          t("labSchedule.failedToSaveChanges")
        );
        setError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="space-y-4">

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          <span>{error}</span>
          {loadFailed && (
            <button
              type="button"
              onClick={() => load()}
              className="rounded-lg px-2 py-1 text-xs font-medium text-error-600 underline hover:bg-error-100 dark:text-error-400 dark:hover:bg-error-500/20"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        {loading ? (
          // Mirrors the week editor: 7 day toggles, a couple of day groups
          // with time-range rows, and the action buttons.
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("common.loading")}</span>
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-[52px] flex-1 rounded-lg" />
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="mb-3 flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <Skeleton className="h-11 w-32 rounded-lg" />
                    <Skeleton className="h-11 w-32 rounded-lg" />
                    <Skeleton className="mb-1 h-4 w-16" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Skeleton className="h-10 w-32 rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          </div>
        ) : (
          <>
            <LabScheduleWeekEditor
              entries={entries}
              onChange={setEntries}
            />
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEntries(original)}
                disabled={!dirty || saving}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("labSchedule.discardChanges")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {saving ? t("auth.saving") : t("settings.saveChanges")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

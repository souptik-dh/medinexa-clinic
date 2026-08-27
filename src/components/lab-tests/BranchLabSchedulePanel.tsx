"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { LabTestSchedule, labTestSchedulesApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import LabScheduleWeekEditor, {
  LabScheduleEntry,
} from "@/components/lab-tests/LabScheduleWeekEditor";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await labTestSchedulesApi.list(branchId);
      const loaded = res.items.map(toEntry);
      setOriginal(loaded);
      setEntries(dedupeEntries(loaded));
    } catch (err) {
      setError(getErrorMessage(err, t("labSchedule.failedToLoadSchedule")));
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
    setSaving(true);
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
      await load();
    } catch (err) {
      const msg = getErrorMessage(
        err,
        t("labSchedule.failedToSaveChanges")
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        {loading ? (
          <DetailSkeleton rows={4} />
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
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("labSchedule.discardChanges")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
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

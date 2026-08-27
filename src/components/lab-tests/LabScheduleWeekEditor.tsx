"use client";
import { inputClass, weekdayLabel, weekdayShortLabel } from "@/components/doctors/scheduleShared";
import { useTranslation } from "@/hooks/useTranslation";

export interface LabScheduleEntry {
  // Stable client-side identity for diffing on save — distinct from `id`,
  // which is only present once the entry has been persisted server-side.
  localKey: string;
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

function newEntry(weekday: number): LabScheduleEntry {
  return {
    localKey: crypto.randomUUID(),
    weekday,
    start_time: "09:00",
    end_time: "17:00",
    is_active: true,
  };
}

export default function LabScheduleWeekEditor({
  entries,
  onChange,
}: {
  entries: LabScheduleEntry[];
  onChange: (next: LabScheduleEntry[]) => void;
}) {
  const { t } = useTranslation();
  const toggleDay = (weekday: number) => {
    const hasEntries = entries.some((e) => e.weekday === weekday);
    if (hasEntries) {
      onChange(entries.filter((e) => e.weekday !== weekday));
    } else {
      onChange([...entries, newEntry(weekday)]);
    }
  };

  const addRangeForDay = (weekday: number) => {
    const candidate = newEntry(weekday);
    const isDuplicate = entries.some(
      (e) =>
        e.weekday === weekday &&
        e.start_time === candidate.start_time &&
        e.end_time === candidate.end_time
    );
    if (isDuplicate) return;
    onChange([...entries, candidate]);
  };

  const updateEntry = (localKey: string, patch: Partial<LabScheduleEntry>) => {
    onChange(entries.map((e) => (e.localKey === localKey ? { ...e, ...patch } : e)));
  };

  const removeEntry = (localKey: string) => {
    onChange(entries.filter((e) => e.localKey !== localKey));
  };

  const groups = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    entries: entries.filter((e) => e.weekday === weekday),
  })).filter((g) => g.entries.length > 0);

  return (
    <div>
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, weekday) => {
          const configured = entries.some((e) => e.weekday === weekday);
          return (
            <button
              key={weekday}
              type="button"
              onClick={() => toggleDay(weekday)}
              title={configured ? t("labSchedule.clickToRemoveDay") : t("labSchedule.clickToAddDay")}
              className={`flex-1 rounded-lg border px-2 py-2.5 text-center text-xs font-semibold transition-colors ${
                configured
                  ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                  : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700"
              }`}
            >
              {weekdayShortLabel(weekday, t)}
              <div className="mt-0.5 text-[10px] font-normal">{configured ? t("labSchedule.scheduled") : t("labSchedule.off")}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        {groups.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("labSchedule.noDaysSelected")}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.weekday} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {weekdayLabel(group.weekday, t)}
              </p>
              <button
                type="button"
                onClick={() => addRangeForDay(group.weekday)}
                className="text-xs font-medium text-brand-500 hover:underline"
              >
                {t("labSchedule.addTimeRange")}
              </button>
            </div>
            <div className="space-y-3">
              {group.entries.map((entry) => (
                <div
                  key={entry.localKey}
                  className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 dark:border-gray-800"
                >
                  <div className="w-32">
                    <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t("labSchedule.startTime")}
                    </label>
                    <input
                      type="time"
                      value={entry.start_time}
                      onChange={(e) => updateEntry(entry.localKey, { start_time: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t("labSchedule.endTime")}
                    </label>
                    <input
                      type="time"
                      value={entry.end_time}
                      onChange={(e) => updateEntry(entry.localKey, { end_time: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <label className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={entry.is_active}
                      onChange={(e) => updateEntry(entry.localKey, { is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/10"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-400">{t("status.active")}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.localKey)}
                    className="mb-1 rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10"
                  >
                    {t("schedule.remove")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

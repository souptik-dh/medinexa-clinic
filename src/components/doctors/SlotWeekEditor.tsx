"use client";
import { BranchOperatingDay, SlotTemplateItem } from "@/lib/api";
import { today } from "@/lib/utils";
import DatePicker from "@/components/form/date-picker";
import { inputClass, weekdayLabel, weekdayShortLabel } from "@/components/doctors/scheduleShared";
import { useTranslation } from "@/hooks/useTranslation";

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextDateForWeekday(weekday: number): string {
  const base = new Date(`${today()}T00:00:00`);
  const diff = (weekday - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  return formatDateOnly(base);
}

function newSlotForWeekday(weekday: number): SlotTemplateItem {
  const startDate = nextDateForWeekday(weekday);
  const endDate = new Date(`${startDate}T00:00:00`);
  endDate.setDate(endDate.getDate() + 90);
  return {
    weekday,
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 20,
    start_date: startDate,
    end_date: formatDateOnly(endDate),
  };
}

export default function SlotWeekEditor({
  slots,
  onChange,
  operatingDays,
  error = false,
}: {
  slots: SlotTemplateItem[];
  onChange: (next: SlotTemplateItem[]) => void;
  operatingDays: BranchOperatingDay[] | null;
  error?: boolean;
}) {
  const { t } = useTranslation();
  const isOpen = (weekday: number): boolean => {
    if (!operatingDays) return true;
    const day = operatingDays.find((d) => d.weekday === weekday);
    return day ? day.is_open : true;
  };

  const toggleDay = (weekday: number) => {
    const hasEntries = slots.some((s) => s.weekday === weekday);
    if (hasEntries) {
      onChange(slots.filter((s) => s.weekday !== weekday));
    } else {
      onChange([...slots, newSlotForWeekday(weekday)]);
    }
  };

  const addRangeForDay = (weekday: number) => {
    onChange([...slots, newSlotForWeekday(weekday)]);
  };

  const updateEntry = (index: number, patch: Partial<SlotTemplateItem>) => {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeEntry = (index: number) => {
    onChange(slots.filter((_, i) => i !== index));
  };

  const groups = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    entries: slots
      .map((slot, index) => ({ slot, index }))
      .filter((s) => s.slot.weekday === weekday),
  })).filter((g) => g.entries.length > 0);

  return (
    <div
      className={
        error ? "rounded-lg border border-error-500 p-3" : undefined
      }
    >
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, weekday) => {
          const open = isOpen(weekday);
          const configured = slots.some((s) => s.weekday === weekday);
          return (
            <button
              key={weekday}
              type="button"
              onClick={() => open && toggleDay(weekday)}
              disabled={!open}
              title={
                !open
                  ? t("slotWeekEditor.branchClosedDay")
                  : configured
                    ? t("labSchedule.clickToRemoveDay")
                    : t("labSchedule.clickToAddDay")
              }
              className={`flex-1 rounded-lg border px-2 py-2.5 text-center text-xs font-semibold transition-colors ${
                !open
                  ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-600"
                  : configured
                    ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700"
              }`}
            >
              {weekdayShortLabel(weekday, t)}
              <div className="mt-0.5 text-[10px] font-normal">
                {!open ? t("slotWeekEditor.closed") : configured ? t("labSchedule.scheduled") : t("labSchedule.off")}
              </div>
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
          <div
            key={group.weekday}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
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
              {group.entries.map(({ slot, index }) => (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 dark:border-gray-800"
                >
                  <div className="w-40">
                    <DatePicker
                      id={`slot-from-${index}`}
                      label={t("slotWeekEditor.appliesFrom")}
                      placeholder={t("schedule.selectDate")}
                      defaultDate={slot.start_date || undefined}
                      onChange={(_, dateStr) => {
                        if (dateStr) updateEntry(index, { start_date: dateStr });
                      }}
                    />
                  </div>
                  <div className="w-40">
                    <DatePicker
                      id={`slot-until-${index}`}
                      label={t("slotWeekEditor.appliesUntil")}
                      placeholder={t("schedule.selectDate")}
                      defaultDate={slot.end_date || undefined}
                      onChange={(_, dateStr) => {
                        if (dateStr) updateEntry(index, { end_date: dateStr });
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <DatePicker
                      id={`slot-start-time-${index}`}
                      mode="time"
                      label={t("labSchedule.startTime")}
                      placeholder={t("slotWeekEditor.selectTime")}
                      defaultDate={slot.start_time || undefined}
                      onChange={(_, timeStr) => {
                        if (timeStr) updateEntry(index, { start_time: timeStr });
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <DatePicker
                      id={`slot-end-time-${index}`}
                      mode="time"
                      label={t("labSchedule.endTime")}
                      placeholder={t("slotWeekEditor.selectTime")}
                      defaultDate={slot.end_time || undefined}
                      onChange={(_, timeStr) => {
                        if (timeStr) updateEntry(index, { end_time: timeStr });
                      }}
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t("slotWeekEditor.durationMin")}
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={slot.slot_duration_minutes}
                      onChange={(e) =>
                        updateEntry(index, { slot_duration_minutes: Number(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(index)}
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

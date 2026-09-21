"use client";
import toast from "react-hot-toast";
import { BranchOperatingDay, SlotLabel, SlotTemplateItem } from "@/lib/api";
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

const PRESET_TIMES: Record<SlotLabel, { start_time: string; end_time: string }> = {
  morning: { start_time: "07:00", end_time: "10:00" },
  afternoon: { start_time: "13:00", end_time: "15:00" },
  evening: { start_time: "18:00", end_time: "21:00" },
  custom: { start_time: "09:00", end_time: "13:00" },
};

const SLOT_LABELS: SlotLabel[] = ["morning", "afternoon", "evening", "custom"];

function newSlotForWeekday(weekday: number, label: SlotLabel = "custom"): SlotTemplateItem {
  const startDate = nextDateForWeekday(weekday);
  const endDate = new Date(`${startDate}T00:00:00`);
  endDate.setDate(endDate.getDate() + 90);
  return {
    weekday,
    label,
    ...PRESET_TIMES[label],
    slot_duration_minutes: 20,
    max_patients: 1,
    is_active: true,
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

  const slotLabelText = (label: SlotLabel): string =>
    ({
      morning: t("slotWeekEditor.labelMorning"),
      afternoon: t("slotWeekEditor.labelAfternoon"),
      evening: t("slotWeekEditor.labelEvening"),
      custom: t("slotWeekEditor.labelCustom"),
    })[label];

  const addRangeForDay = (weekday: number, label: SlotLabel = "custom") => {
    if (label !== "custom" && slots.some((s) => s.weekday === weekday && s.label === label)) {
      toast.error(`${slotLabelText(label)} is already added for this day.`);
      return;
    }
    onChange([...slots, newSlotForWeekday(weekday, label)]);
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {weekdayLabel(group.weekday, t)}
              </p>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {SLOT_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => addRangeForDay(group.weekday, label)}
                    className="min-h-[34px] basis-[calc(50%-0.25rem)] rounded-md border border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-brand-500 hover:underline dark:border-gray-800 sm:basis-auto sm:min-h-0 sm:flex-none sm:border-0 sm:px-0 sm:py-0"
                  >
                    + {slotLabelText(label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {group.entries.map(({ slot, index }) => (
                <div
                  key={index}
                  className={`flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 dark:border-gray-800 ${
                    slot.is_active === false ? "opacity-50" : ""
                  }`}
                >
                  <div className="w-32">
                    <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t("slotWeekEditor.period")}
                    </label>
                    <select
                      value={slot.label ?? "custom"}
                      onChange={(e) => updateEntry(index, { label: e.target.value as SlotLabel })}
                      className={inputClass}
                    >
                      {SLOT_LABELS.map((label) => (
                        <option key={label} value={label}>
                          {slotLabelText(label)}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  <div className="w-24">
                    <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t("slotWeekEditor.maxPatients")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={slot.max_patients}
                      onChange={(e) =>
                        updateEntry(index, { max_patients: Number(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </div>
                  <label className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={slot.is_active}
                      onChange={(e) => updateEntry(index, { is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/10"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-400">{t("status.active")}</span>
                  </label>
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

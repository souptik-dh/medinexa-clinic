export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Translated weekday name for index 0 (Sunday) through 6 (Saturday). */
export function weekdayLabel(index: number, t: (key: string) => string): string {
  return t(`weekdays.${WEEKDAY_KEYS[index]}`);
}

/** Translated 3-letter weekday abbreviation for index 0 (Sun) through 6 (Sat). */
export function weekdayShortLabel(index: number, t: (key: string) => string): string {
  return t(`weekdaysShort.${WEEKDAY_KEYS[index]}`);
}

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50";

export function SlotTypeOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
      }`}
    >
      <p
        className={`text-sm font-medium ${
          selected ? "text-brand-600 dark:text-brand-400" : "text-gray-800 dark:text-white/90"
        }`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  );
}

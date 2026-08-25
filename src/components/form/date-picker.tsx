import { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
// Imported here (not the root layout) so pages that never render a DatePicker
// don't ship this CSS.
import 'flatpickr/dist/flatpickr.css';
import Label from './Label';
import { CalenderIcon, TimeIcon } from '../../icons';
import Hook = flatpickr.Options.Hook;
import DateOption = flatpickr.Options.DateOption;
import DateLimit = flatpickr.Options.DateLimit;
import Instance = flatpickr.Instance;

type PropsType = {
  id: string;
  mode?: "single" | "multiple" | "range" | "time";
  onChange?: Hook | Hook[];
  onBlur?: () => void;
  /** Fires when a day cell is created — lets a caller inject markup (e.g. an availability dot) into each cell. Not memoization-sensitive: always reads the latest value. */
  onDayCreate?: Hook | Hook[];
  defaultDate?: DateOption;
  minDate?: DateOption;
  maxDate?: DateOption;
  /** Specific dates (or ranges/predicate) to grey out and make unselectable — e.g. a doctor's non-bookable days. */
  disable?: DateLimit[];
  disabled?: boolean;
  /** Renders the calendar inline (always visible) instead of as a popup triggered by clicking the input. The input itself is visually hidden in this mode. */
  inline?: boolean;
  label?: string;
  placeholder?: string;
  error?: boolean;
  hint?: string;
};

export default function DatePicker({
  id,
  mode,
  onChange,
  onBlur,
  onDayCreate,
  label,
  defaultDate,
  minDate,
  maxDate,
  disable,
  disabled = false,
  inline = false,
  placeholder,
  error = false,
  hint,
}: PropsType) {
  const isTime = mode === "time";

  // Callbacks are read through refs (always the latest render's value)
  // instead of sitting in the effect's dependency array - an inline arrow
  // function passed by the caller (the common case) would otherwise recreate
  // the flatpickr instance on every render, which can make an in-progress
  // open/close interaction look like it silently "does nothing."
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onDayCreateRef = useRef(onDayCreate);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onDayCreateRef.current = onDayCreate;
  }, [onChange, onBlur, onDayCreate]);

  useEffect(() => {
    const flatPickr = flatpickr(`#${id}`, {
      mode: isTime ? "single" : mode || "single",
      appendTo: inline ? undefined : document.body,
      inline,
      monthSelectorType: "static",
      dateFormat: isTime ? "H:i" : "Y-m-d",
      noCalendar: isTime,
      enableTime: isTime,
      defaultDate,
      minDate,
      maxDate,
      disable,
      time_24hr: isTime,
      onChange: (dates: Date[], dateStr: string, instance: Instance, data?: unknown) => {
        const cb = onChangeRef.current;
        if (Array.isArray(cb)) cb.forEach((fn) => fn(dates, dateStr, instance, data));
        else cb?.(dates, dateStr, instance, data);
      },
      onClose: () => onBlurRef.current?.(),
      onDayCreate: (dates: Date[], dateStr: string, instance: Instance, data?: unknown) => {
        const cb = onDayCreateRef.current;
        if (Array.isArray(cb)) cb.forEach((fn) => fn(dates, dateStr, instance, data));
        else cb?.(dates, dateStr, instance, data);
      },
    });

    return () => {
      if (!Array.isArray(flatPickr)) {
        flatPickr.destroy();
      }
    };
  }, [mode, isTime, id, defaultDate, minDate, maxDate, disable, inline]);

  if (inline) {
    return (
      <div>
        {label && <Label htmlFor={id}>{label}</Label>}
        <input id={id} className="sr-only" tabIndex={-1} aria-hidden readOnly disabled={disabled} />
        {hint && (
          <p className={`mt-1.5 text-xs ${error ? "text-error-500" : "text-gray-500"}`}>{hint}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          id={id}
          placeholder={placeholder}
          onBlur={onBlur}
          disabled={disabled}
          className={`h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:placeholder:text-white/30 bg-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? "text-error-800 border-error-500 focus:border-error-500 focus:ring-error-500/10 dark:text-error-400 dark:border-error-500"
              : "text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
          }`}
        />

        <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
          {isTime ? <TimeIcon className="size-6" /> : <CalenderIcon className="size-6" />}
        </span>
      </div>

      {hint && (
        <p className={`mt-1.5 text-xs ${error ? "text-error-500" : "text-gray-500"}`}>{hint}</p>
      )}
    </div>
  );
}

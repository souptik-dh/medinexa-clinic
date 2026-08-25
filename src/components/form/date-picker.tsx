import { useEffect } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import Label from './Label';
import { CalenderIcon, TimeIcon } from '../../icons';
import Hook = flatpickr.Options.Hook;
import DateOption = flatpickr.Options.DateOption;

type PropsType = {
  id: string;
  mode?: "single" | "multiple" | "range" | "time";
  onChange?: Hook | Hook[];
  onBlur?: () => void;
  defaultDate?: DateOption;
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
  label,
  defaultDate,
  placeholder,
  error = false,
  hint,
}: PropsType) {
  const isTime = mode === "time";

  useEffect(() => {
    const flatPickr = flatpickr(`#${id}`, {
      mode: isTime ? "single" : mode || "single",
      appendTo: document.body,
      monthSelectorType: "static",
      dateFormat: isTime ? "H:i" : "Y-m-d",
      noCalendar: isTime,
      enableTime: isTime,
      time_24hr: isTime,
      defaultDate,
      onChange,
      onClose: onBlur,
    });

    return () => {
      if (!Array.isArray(flatPickr)) {
        flatPickr.destroy();
      }
    };
  }, [mode, isTime, onChange, onBlur, id, defaultDate]);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          id={id}
          placeholder={placeholder}
          onBlur={onBlur}
          className={`h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:placeholder:text-white/30 bg-transparent ${
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

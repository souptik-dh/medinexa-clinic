export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export const inputErrorClass =
  "h-11 w-full rounded-lg border border-error-500 bg-transparent px-4 text-sm text-gray-800 focus:border-error-500 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 dark:border-error-500 dark:bg-gray-900 dark:text-error-400";

export const selectClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50";

export const selectErrorClass =
  "h-11 w-full rounded-lg border border-error-500 bg-transparent px-3 text-sm text-gray-800 focus:border-error-500 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 dark:border-error-500 dark:bg-gray-900 dark:text-error-400 disabled:opacity-50";

export const textareaClass =
  "w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export const textareaErrorClass =
  "w-full rounded-lg border border-error-500 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-error-500 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 dark:border-error-500 dark:bg-gray-900 dark:text-error-400";

export function getInputClass(hasError: boolean) {
  return hasError ? inputErrorClass : inputClass;
}

export function getSelectClass(hasError: boolean) {
  return hasError ? selectErrorClass : selectClass;
}

export function getTextareaClass(hasError: boolean) {
  return hasError ? textareaErrorClass : textareaClass;
}

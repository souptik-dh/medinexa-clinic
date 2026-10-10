"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LabTestPrecaution, labTestPrecautionsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

// Search and the category filter only appear once the list is longer than this.
const FILTER_THRESHOLD = 8;

interface LabTestPrecautionsPickerProps {
  /** Selected master precaution ids, owned by the parent form. */
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * "Test Preparation & Precautions" on the add/edit lab test forms: the active
 * master precautions (GET /lab-test-precautions) as checkboxes. The parent owns
 * the selection and sends it as `precaution_ids` on save. Selecting none is valid.
 */
export default function LabTestPrecautionsPicker({
  selected,
  onChange,
  disabled = false,
}: LabTestPrecautionsPickerProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<LabTestPrecaution[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await labTestPrecautionsApi.list();
      setItems(res.items);
    } catch (err) {
      setLoadError(getErrorMessage(err, t("labTestPrecautions.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const categories = useMemo(
    () => [...new Set(items.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [items]
  );
  const showFilters = items.length > FILTER_THRESHOLD;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    );
  }, [items, query, category]);
  // Selected precautions in master-list order — the preview before saving.
  const selectedItems = useMemo(
    () => items.filter((p) => selectedSet.has(p.id)),
    [items, selectedSet]
  );

  // Emit in master-list order so the saved order is stable.
  const emit = (next: Set<string>) => onChange(items.filter((p) => next.has(p.id)).map((p) => p.id));

  const toggle = (p: LabTestPrecaution) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(p.id)) next.delete(p.id);
    else next.add(p.id);
    emit(next);
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {t("labTestPrecautions.title")}
      </label>
      <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
        {t("labTestPrecautions.formSub")}
      </p>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.04]"
            />
          ))}
        </div>
      ) : loadError ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-error-500/30 bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={load}
            className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("labTestPrecautions.noneAvailable")}
        </p>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t("labTestPrecautions.selectedCount", { count: selectedItems.length })}
            </span>
            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() => emit(new Set())}
                disabled={disabled}
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-500/10"
              >
                {t("labTestPrecautions.clearAll")}
              </button>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 border-b border-gray-100 px-3 py-2 dark:border-gray-800"
              aria-label={t("labTestPrecautions.previewLabel")}
            >
              {selectedItems.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                >
                  {p.name}
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    disabled={disabled}
                    aria-label={t("labTestPrecautions.remove", { name: p.name })}
                    className="text-brand-400 hover:text-brand-600 disabled:cursor-not-allowed"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {showFilters && (
            <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800 sm:flex-row">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("labTestPrecautions.searchPlaceholder")}
                className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label={t("labTestPrecautions.category")}
                className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 sm:w-44"
              >
                <option value="">{t("labTestPrecautions.allCategories")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("labTestPrecautions.noMatch")}
            </p>
          ) : (
            <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {visible.map((p) => {
                const on = selectedSet.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition ${
                      on ? "bg-brand-50/60 dark:bg-brand-500/[0.06]" : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() => toggle(p)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30 dark:border-gray-600"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                        {p.name}
                      </span>
                      {p.description && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {p.description}
                        </span>
                      )}
                    </span>
                    {p.category && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {p.category}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

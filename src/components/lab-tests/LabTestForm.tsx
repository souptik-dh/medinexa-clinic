"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabTestCategory, labTestsApi } from "@/lib/api";
import { labTestCategoryLabel } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import LabTestPrecautionsPicker from "@/components/lab-tests/LabTestPrecautionsPicker";

// Fixed-category legacy values, kept as starting suggestions for a clinic
// with no lab tests yet. Category itself is free text (see labTestsApi.categories()).
const DEFAULT_CATEGORY_SUGGESTIONS = [
  "Blood Test",
  "Cardiology",
  "Diabetes",
  "Urine Test",
  "Imaging",
  "General Diagnostics",
  "Health Check",
  "Other",
];

// Edit keeps the original fixed dropdown rather than the create-mode
// combobox, since existing tests already have a real category worth editing
// directly — these are its options, in their legacy raw (snake_case) form.
const EDIT_CATEGORY_VALUES = [
  "blood_test",
  "cardiology",
  "diabetes",
  "urine_test",
  "imaging",
  "general_diagnostics",
  "health_check",
  "other",
];

export interface LabTestFormValues {
  name: string;
  code: string;
  description: string;
  category: LabTestCategory;
  instructions: string;
  /** Selected master precaution ids (GET /lab-test-precautions). */
  precaution_ids: string[];
}

export const EMPTY_LAB_TEST_FORM: LabTestFormValues = {
  name: "",
  code: "",
  description: "",
  category: "",
  instructions: "",
  precaution_ids: [],
};

interface LabTestFormProps {
  // "create" hides Name/Code (auto-derived from category by the backend) and
  // turns Category into a type-or-pick combobox. "edit" keeps the full
  // Name/Code/Category fields for tests that already have real values.
  mode: "create" | "edit";
  initial: LabTestFormValues;
  submitLabel: string;
  cancelHref?: string;
  /** When provided, cancel hands control back to the host (e.g. a drawer)
   * instead of navigating to cancelHref. */
  onCancel?: () => void;
  onSubmit: (payload: {
    name?: string;
    code?: string;
    description: string | null;
    category: LabTestCategory;
    instructions: string | null;
    precaution_ids: string[];
  }) => Promise<void>;
  /** Lets an embedding drawer block closing while a save is in flight. */
  onPendingChange?: (pending: boolean) => void;
}

export default function LabTestForm({ mode, initial, submitLabel, cancelHref, onCancel, onSubmit, onPendingChange }: LabTestFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState<LabTestFormValues>(initial);
  const { pending: isSaving, run: runSave } = useAsyncAction();
  // Stays set after a successful save (as before) so the host can close or
  // navigate away without the submit button re-enabling in between.
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPendingChange?.(isSaving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving]);
  // The host may unmount the form from onSubmit while the save is still
  // settling - make sure it never keeps a stale "pending" flag.
  useEffect(
    () => () => onPendingChange?.(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [categoryOptions, setCategoryOptions] = useState<string[]>(DEFAULT_CATEGORY_SUGGESTIONS);

  useEffect(() => {
    labTestsApi
      .categories()
      .then((res) => {
        if (res.items.length > 0) {
          const names = res.items.map((c) => c.name);
          setCategoryOptions(Array.from(new Set([...names, ...DEFAULT_CATEGORY_SUGGESTIONS])));
        }
      })
      .catch(() => {});
  }, []);

  const updateField = (field: keyof Omit<LabTestFormValues, "precaution_ids">, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setPrecautions = (ids: string[]) => {
    setForm((prev) => ({ ...prev, precaution_ids: ids }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "edit") {
      if (!form.name.trim()) {
        setError(t("labTestForm.nameRequired"));
        return;
      }
      if (!form.code.trim()) {
        setError(t("labTestForm.codeRequired"));
        return;
      }
    }
    if (!form.category.trim()) {
      setError(t("labTestForm.categoryRequired"));
      return;
    }
    if (saved) return;
    // Locked: a repeated Enter/click while saving is a no-op.
    await runSave(async () => {
      setError(null);
      try {
        await onSubmit({
          ...(mode === "edit" ? { name: form.name.trim(), code: form.code.trim() } : {}),
          description: form.description.trim() || null,
          category: form.category.trim(),
          instructions: form.instructions.trim() || null,
          precaution_ids: form.precaution_ids,
        });
        setSaved(true);
      } catch {
        // The host already showed the error; fields are kept for a retry.
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-[560px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      <div className="space-y-4">
        {mode === "edit" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("labTestForm.name")}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                maxLength={255}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("labTestForm.code")}
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder={t("labTestForm.codePlaceholder")}
                maxLength={50}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("labTestForm.description")}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("labTestForm.category")}
          </label>
          {mode === "create" ? (
            <>
              <input
                type="text"
                list="lab-test-category-options"
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
                placeholder={t("labTestForm.categoryPlaceholder")}
                maxLength={100}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <datalist id="lab-test-category-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                {t("labTestForm.categoryHint")}
              </p>
            </>
          ) : (
            <select
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {/* Tests created via the category-only flow can carry a value outside
                 this fixed list — keep it selectable so saving doesn't silently
                 overwrite it with the first option. */}
              {!EDIT_CATEGORY_VALUES.includes(form.category) && form.category && (
                <option value={form.category}>{form.category}</option>
              )}
              {EDIT_CATEGORY_VALUES.map((c) => (
                <option key={c} value={c}>
                  {labTestCategoryLabel(c)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("labTestForm.instructions")}
          </label>
          <textarea
            value={form.instructions}
            onChange={(e) => updateField("instructions", e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t("labTestForm.instructionsPlaceholder")}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <LabTestPrecautionsPicker
          selected={form.precaution_ids}
          onChange={setPrecautions}
          disabled={isSaving || saved}
        />
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : cancelHref && router.push(cancelHref))}
          disabled={isSaving}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={isSaving || saved}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
        >
          {isSaving || saved ? t("auth.saving") : submitLabel}
        </button>
      </div>
    </form>
  );
}
